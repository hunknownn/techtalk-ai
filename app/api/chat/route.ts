import { NextRequest } from "next/server";
import {
  query,
  forkSession,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { db } from "@/lib/db";
import { ingestNewArtifacts } from "@/lib/ingest";
import { getCurrentUser } from "@/lib/webauth";
import { ensureUserRuntime, agentEnv, hasSubscription } from "@/lib/userenv";
import { saveUsageSnapshot } from "@/lib/usage";
import { createTurnGuard } from "@/lib/turnGuard";

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

  // 모델 권한 확인 — 본인 구독 연결 필수, 폴백 없음
  const rt = ensureUserRuntime(user);
  if (!hasSubscription(rt)) {
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
      // 모델이 가짜 user/system 턴을 이어쓰는지 감시한다(lib/turnGuard.ts).
      // 잘라내는 범위는 화면과 messages 테이블까지다 — 모델이 보는 히스토리는
      // SDK가 쓰는 jsonl이라 여기선 못 막는다. 그쪽은 아래 세션 포크가 끊는다.
      const turnGuard = createTurnGuard();
      let sdkSessionId = session.sdk_session_id;
      // 이번 턴 사용자 메시지의 uuid — 오염 감지 시 여기까지만 남기고 포크한다
      let userMessageUuid: string | null = null;
      let contextTokens: number | null = null;
      let contextMaxTokens: number | null = null;

      // ★ 문자열 프롬프트를 주면 SDK가 "단일 턴 one-shot"으로 처리한다. 로컬 CLI는
      // 지속 대화 세션(AsyncIterable)으로 도는데, 이 차이가 모델을 "작업 완수형"으로
      // 몰아 소크라테스 문답에서 사용자 답까지 혼자 이어쓰게 만든다. 같은 스킬을
      // 로컬 CLI에서 쓸 땐 멀쩡한데 웹에서만 터진 원인이 이 지점이다.
      // → CLI와 동일한 스트리밍 입력 모드로 맞추고, 턴이 끝나면 명시적으로 닫는다.
      let closeInput!: () => void;
      const inputClosed = new Promise<void>((resolve) => {
        closeInput = resolve;
      });
      async function* promptStream(): AsyncGenerator<SDKUserMessage> {
        yield {
          type: "user",
          parent_tool_use_id: null,
          message: { role: "user", content: prompt },
        };
        // result를 받을 때까지 입력을 열어둔다. 프로세스가 살아있어야
        // 컨트롤 메서드(getContextUsage 등)를 안전하게 부를 수 있다.
        await inputClosed;
      }

      try {
        const q = query({
          prompt: promptStream(),
          options: {
            cwd: rt.outputDir,
            ...(sdkSessionId ? { resume: sdkSessionId } : {}),
            // ★ CLI와 동일한 "대화형" 동작을 위해 Claude Code 기본 시스템 프롬프트를
            // 명시적으로 켠다. 미지정 시 SDK는 이 프롬프트를 넣지 않아, 모델이
            // "작업 완수형"으로 굴러 소크라테스/실무 문답에서 사용자 답까지 혼자
            // 지어내며 여러 계단을 자동 진행하는 문제가 생긴다(로컬 CLI에선 이 프롬프트가
            // 항상 포함돼 멀쩡했음). preset을 켜면 "질문하고 사용자에게 넘긴다"는
            // 대화형 규범이 복원된다.
            systemPrompt: { type: "preset", preset: "claude_code" },
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
            // 사용자 격리의 핵심: 홈·설정 디렉토리 분리 (자격증명도 그 안에 있다)
            env: agentEnv(rt),
            // 모델 선택 ("기본 모델" = Opus 고정 — 딥다이브 품질 우선)
            model: model && model !== "default" ? model : "opus",
          },
        });

        for await (const msg of q) {
          if (msg.type === "system" && msg.subtype === "init") {
            sdkSessionId = msg.session_id;
          } else if (msg.type === "user") {
            // CLI가 우리 입력을 uuid와 함께 되돌려준다. 첫 것이 이번 턴의 사용자 메시지다
            if (!userMessageUuid && msg.uuid) userMessageUuid = msg.uuid;
          } else if (msg.type === "result") {
            // 이 요청은 한 턴만 담당한다 — 입력을 닫아 프로세스를 정리한다
            closeInput();
          } else if (msg.type === "stream_event") {
            const ev = msg.event;
            if (
              ev.type === "content_block_delta" &&
              ev.delta.type === "text_delta"
            ) {
              const safe = turnGuard.push(ev.delta.text);
              if (safe) {
                assistantText += safe;
                send({ type: "text", text: safe });
              }
            }
          } else if (msg.type === "assistant") {
            for (const block of msg.message.content) {
              if (block.type === "tool_use") {
                send({ type: "tool", name: block.name });
              }
            }
            // 컨트롤 메서드는 프로세스가 살아있는 동안(= 루프 안에서)만 호출 가능하다.
            // 스트리밍 입력으로 바꾼 뒤로는 result를 받을 때까지 입력이 열려 있어
            // 예전처럼 stdin이 먼저 닫히는 레이스는 사라졌다. 그래도 두 호출은
            // 서로 독립이므로 동시에(Promise.allSettled) 부른다.
            // assistant 메시지마다 최신값으로 덮어써서, 성공한 마지막 호출이 최종값이 되게 한다.
            const [ctxResult, usageResult] = await Promise.allSettled([
              q.getContextUsage(),
              q.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET(),
            ]);
            if (ctxResult.status === "fulfilled") {
              contextTokens = ctxResult.value.totalTokens;
              contextMaxTokens = ctxResult.value.maxTokens;
            } else {
              console.error("[chat:getContextUsage failed]", ctxResult.reason);
            }
            if (usageResult.status === "fulfilled") {
              const usage = usageResult.value;
              if (usage.rate_limits_available && usage.rate_limits) {
                saveUsageSnapshot(user.id, usage.rate_limits);
              } else {
                console.log(
                  "[chat:usage_EXPERIMENTAL not available]",
                  JSON.stringify({
                    rate_limits_available: usage.rate_limits_available,
                    rate_limits: usage.rate_limits,
                    subscription_type: usage.subscription_type,
                  })
                );
              }
            } else {
              console.error("[chat:usage_EXPERIMENTAL failed]", usageResult.reason);
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

        // 마지막 줄은 개행이 없어 보류돼 있을 수 있다 — 회수해서 흘린다
        const tail = turnGuard.flush();
        if (tail) {
          assistantText += tail;
          send({ type: "text", text: tail });
        }
        if (turnGuard.truncated) {
          console.warn(
            "[chat:turn-guard] 모델이 가짜 턴을 이어써서 응답을 잘라냄",
            { sessionId: session.id, sdkSessionId }
          );
          // 잘라낸 건 화면·messages 테이블뿐이고, 오염된 assistant 턴은 SDK의
          // jsonl에 그대로 남는다. 그대로 두면 다음 resume 때 모델이 자기 출력을
          // 예시로 다시 보고 패턴이 굳는다(래칫). 이번 사용자 메시지까지만 남긴
          // 새 브랜치로 갈아타 그 되먹임을 끊는다.
          if (sdkSessionId && userMessageUuid) {
            try {
              const forked = await forkSession(sdkSessionId, {
                dir: rt.outputDir,
                upToMessageId: userMessageUuid,
              });
              sdkSessionId = forked.sessionId;
              send({ type: "sanitized" });
            } catch (e) {
              console.error("[chat:forkSession failed]", e);
            }
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
        // 에러로 빠져나온 경우 result를 못 받았을 수 있다 — 생성기가 매달리지 않게 닫는다
        closeInput();
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
