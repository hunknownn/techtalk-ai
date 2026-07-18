import { query } from "@anthropic-ai/claude-agent-sdk";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/webauth";
import { ensureUserRuntime, readUserToken } from "@/lib/userenv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

interface SessionRow {
  id: number;
  sdk_session_id: string | null;
  model: string | null;
}

/**
 * 수동 컨텍스트 압축 — CLI의 /compact와 동일하게, 프롬프트로 "/compact"를
 * 보내 SDK 빌트인 명령을 트리거한다. 채팅 메시지 테이블은 건드리지 않는다
 * (대화창에 "/compact" 말풍선이 남지 않게).
 */
export async function POST(req: Request) {
  const { sessionId } = (await req.json()) as { sessionId?: number };
  if (!sessionId) {
    return Response.json({ error: "sessionId is required" }, { status: 400 });
  }

  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const rt = ensureUserRuntime(user);
  const subscriptionToken = readUserToken(rt);
  if (!subscriptionToken) {
    return Response.json(
      { error: "no_subscription", message: "구독 연결이 필요합니다 (/auth)" },
      { status: 403 }
    );
  }

  const session = db
    .prepare(
      "SELECT id, sdk_session_id, model FROM sessions WHERE id = ? AND user_id = ?"
    )
    .get(sessionId, user.id) as SessionRow | undefined;
  if (!session) {
    return Response.json({ error: "session not found" }, { status: 404 });
  }
  if (!session.sdk_session_id) {
    return Response.json(
      { error: "empty_session", message: "아직 대화가 없어 압축할 내용이 없습니다" },
      { status: 400 }
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (ev: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));

      controller.enqueue(encoder.encode(": open\n\n"));
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          /* 이미 닫힘 */
        }
      }, 15000);

      try {
        const q = query({
          prompt: "/compact",
          options: {
            cwd: rt.outputDir,
            resume: session.sdk_session_id!,
            permissionMode: "bypassPermissions",
            settingSources: ["user"],
            includePartialMessages: true,
            ...(process.env.CLAUDE_CODE_PATH
              ? { pathToClaudeCodeExecutable: process.env.CLAUDE_CODE_PATH }
              : {}),
            env: {
              ...(process.env as Record<string, string>),
              HOME: rt.home,
              CLAUDE_CODE_OAUTH_TOKEN: subscriptionToken,
            },
            model: session.model && session.model !== "default" ? session.model : "opus",
          },
        });

        let contextTokens: number | null = null;
        let contextMaxTokens: number | null = null;
        let compacted = false;
        let sdkSessionId = session.sdk_session_id;

        for await (const msg of q) {
          if (msg.type === "system" && msg.subtype === "init") {
            sdkSessionId = msg.session_id;
          } else if (msg.type === "system" && msg.subtype === "compact_boundary") {
            compacted = true;
            const { trigger, pre_tokens, post_tokens } = msg.compact_metadata;
            send({
              type: "compact",
              trigger,
              preTokens: pre_tokens,
              postTokens: post_tokens ?? null,
            });
            // 컨트롤 메서드는 프로세스가 살아있는 동안(= 루프 안에서)만 호출 가능하다.
            // result 메시지가 오면 SDK가 즉시 stdin을 닫으므로, 그 전인
            // compact_boundary 시점에 바로 조회한다.
            try {
              const ctxUsage = await q.getContextUsage();
              contextTokens = ctxUsage.totalTokens;
              contextMaxTokens = ctxUsage.maxTokens;
            } catch (e) {
              console.error("[compact:getContextUsage failed]", e);
            }
          }
        }

        db.prepare(
          "UPDATE sessions SET sdk_session_id = ?, context_tokens = COALESCE(?, context_tokens), context_max_tokens = COALESCE(?, context_max_tokens) WHERE id = ?"
        ).run(sdkSessionId, contextTokens, contextMaxTokens, session.id);
        send({ type: "done", compacted, contextTokens, contextMaxTokens });
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
