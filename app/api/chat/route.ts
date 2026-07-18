import { NextRequest } from "next/server";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { db } from "@/lib/db";
import { ingestNewArtifacts } from "@/lib/ingest";
import { getCurrentUser } from "@/lib/webauth";
import { ensureUserRuntime, readUserToken } from "@/lib/userenv";
import { saveUsageSnapshot } from "@/lib/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 소크라테스/드릴의 긴 딥다이브 응답 대비
export const maxDuration = 600;

const MODE_FLAGS: Record<string, string> = {
  produce: "--produce",
  socratic: "--socratic",
  drill: "--drill",
};

interface SessionRow {
  id: number;
  mode: string;
  sdk_session_id: string | null;
}

export async function POST(req: NextRequest) {
  const { sessionId, mode, message, model } = (await req.json()) as {
    sessionId?: number;
    mode?: string;
    message: string;
    model?: string;
  };

  if (!message?.trim()) {
    return Response.json({ error: "message is required" }, { status: 400 });
  }

  // 신원 확인 (웹 로그인)
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  // 모델 권한 확인 — 본인 구독 토큰 필수, 폴백 없음
  const rt = ensureUserRuntime(user);
  const subscriptionToken = readUserToken(rt);
  if (!subscriptionToken) {
    return Response.json(
      { error: "no_subscription", message: "구독 연결이 필요합니다 (/auth)" },
      { status: 403 }
    );
  }

  let session: SessionRow;
  let prompt: string;

  if (sessionId) {
    // 기존 세션 이어가기: 메시지 그대로 전달 (SDK가 resume으로 맥락 유지)
    const row = db
      .prepare(
        "SELECT id, mode, sdk_session_id FROM sessions WHERE id = ? AND user_id = ?"
      )
      .get(sessionId, user.id) as SessionRow | undefined;
    if (!row) {
      return Response.json({ error: "session not found" }, { status: 404 });
    }
    session = row;
    prompt = message;
  } else {
    // 새 세션: 스킬이 인식하는 모드 플래그를 붙여 techtalk 스킬 발동
    const flag = MODE_FLAGS[mode ?? ""];
    if (!flag) {
      return Response.json(
        { error: "mode must be one of produce|socratic|drill" },
        { status: 400 }
      );
    }
    const info = db
      .prepare(
        "INSERT INTO sessions (topic, mode, model, user_id) VALUES (?, ?, ?, ?)"
      )
      .run(message.slice(0, 200), mode, model ?? null, user.id);
    session = { id: Number(info.lastInsertRowid), mode: mode!, sdk_session_id: null };
    prompt = `techtalk ${flag} ${message}`;
  }

  db.prepare(
    "INSERT INTO messages (session_id, role, content) VALUES (?, 'user', ?)"
  ).run(session.id, message);

  const startMs = Date.now();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (ev: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));

      // Cloudflare 100초 유휴 차단(524) 방지.
      // 첫 토큰까지 오래 걸리거나(스킬 로딩·resume) 턴 중간 툴 실행으로
      // 텍스트 델타가 끊기는 침묵 구간이 100초를 넘으면 연결이 잘린다.
      // → 즉시 첫 바이트를 흘리고, 15초마다 주석 하트비트를 보낸다.
      // (클라 파서는 'data: '로 시작 안 하는 청크를 무시하므로 안전)
      controller.enqueue(encoder.encode(": open\n\n"));
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          /* 이미 닫힘 */
        }
      }, 15000);

      let assistantText = "";
      let sdkSessionId = session.sdk_session_id;
      let contextTokens: number | null = null;
      let contextMaxTokens: number | null = null;

      try {
        const q = query({
          prompt,
          options: {
            cwd: rt.outputDir,
            ...(sdkSessionId ? { resume: sdkSessionId } : {}),
            // 신뢰된 개인 사용자 공간: 스킬의 파일쓰기(산출물)를 막지 않는다
            permissionMode: "bypassPermissions",
            // 사용자 홈의 ~/.claude/skills 에서 techtalk 스킬 로드
            settingSources: ["user"],
            includePartialMessages: true,
            // 컨테이너에선 standalone 번들이 SDK 네이티브 바이너리를 누락하므로
            // 이미지에 설치된 글로벌 CLI를 명시 (로컬 개발은 미설정 → SDK 기본값)
            ...(process.env.CLAUDE_CODE_PATH
              ? { pathToClaudeCodeExecutable: process.env.CLAUDE_CODE_PATH }
              : {}),
            // 사용자 격리의 핵심: 홈 디렉토리 + 본인 구독 토큰 주입 (폴백 없음)
            env: {
              ...(process.env as Record<string, string>),
              HOME: rt.home,
              CLAUDE_CODE_OAUTH_TOKEN: subscriptionToken,
            },
            // 모델 선택 ("기본 모델" = Opus 고정 — 딥다이브 품질 우선)
            model: model && model !== "default" ? model : "opus",
          },
        });

        for await (const msg of q) {
          if (msg.type === "system" && msg.subtype === "init") {
            sdkSessionId = msg.session_id;
          } else if (msg.type === "stream_event") {
            const ev = msg.event;
            if (
              ev.type === "content_block_delta" &&
              ev.delta.type === "text_delta"
            ) {
              assistantText += ev.delta.text;
              send({ type: "text", text: ev.delta.text });
            }
          } else if (msg.type === "assistant") {
            for (const block of msg.message.content) {
              if (block.type === "tool_use") {
                send({ type: "tool", name: block.name });
              }
            }
            // 컨트롤 메서드는 프로세스가 살아있는 동안(= 루프 안에서)만 호출 가능하다.
            // query()에 문자열 프롬프트를 주면 SDK가 "단일 턴"으로 보고 result
            // 수신 즉시 stdin을 닫아버려서, 루프 종료 후에는 항상
            // "ProcessTransport is not ready for writing"로 실패한다.
            // assistant 메시지마다 최신값으로 덮어써서, 마지막 호출 결과가 최종값이 되게 한다.
            try {
              const ctxUsage = await q.getContextUsage();
              contextTokens = ctxUsage.totalTokens;
              contextMaxTokens = ctxUsage.maxTokens;
            } catch (e) {
              console.error("[chat:getContextUsage failed]", e);
            }
            try {
              const usage = await q.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET();
              if (usage.rate_limits_available && usage.rate_limits) {
                saveUsageSnapshot(user.id, usage.rate_limits);
              }
            } catch (e) {
              console.error("[chat:usage_EXPERIMENTAL failed]", e);
            }
          } else if (msg.type === "system" && msg.subtype === "compact_boundary") {
            // 자동 압축(컨텍스트 한도 근접 시 SDK가 알아서 요약)도 여기서 감지된다
            const { trigger, pre_tokens, post_tokens } = msg.compact_metadata;
            send({
              type: "compact",
              trigger,
              preTokens: pre_tokens,
              postTokens: post_tokens ?? null,
            });
          }
        }

        db.prepare(
          "UPDATE sessions SET sdk_session_id = ?, context_tokens = COALESCE(?, context_tokens), context_max_tokens = COALESCE(?, context_max_tokens), model = COALESCE(?, model) WHERE id = ?"
        ).run(sdkSessionId, contextTokens, contextMaxTokens, model ?? null, session.id);
        if (assistantText) {
          db.prepare(
            "INSERT INTO messages (session_id, role, content) VALUES (?, 'assistant', ?)"
          ).run(session.id, assistantText);
        }

        const artifacts = ingestNewArtifacts(session.id, startMs, {
          outputDir: rt.outputDir,
          userId: user.id,
        });
        send({
          type: "done",
          sessionId: session.id,
          artifacts,
          contextTokens,
          contextMaxTokens,
        });
      } catch (e) {
        send({
          type: "error",
          message: e instanceof Error ? e.message : String(e),
        });
      } finally {
        clearInterval(heartbeat);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
