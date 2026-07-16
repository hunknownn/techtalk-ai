import { NextRequest } from "next/server";
import { query } from "@anthropic-ai/claude-agent-sdk";
import fs from "node:fs";
import { db, OUTPUT_DIR } from "@/lib/db";
import { ingestNewArtifacts } from "@/lib/ingest";

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
  const { sessionId, mode, message } = (await req.json()) as {
    sessionId?: number;
    mode?: string;
    message: string;
  };

  if (!message?.trim()) {
    return Response.json({ error: "message is required" }, { status: 400 });
  }

  let session: SessionRow;
  let prompt: string;

  if (sessionId) {
    // 기존 세션 이어가기: 메시지 그대로 전달 (SDK가 resume으로 맥락 유지)
    const row = db
      .prepare("SELECT id, mode, sdk_session_id FROM sessions WHERE id = ?")
      .get(sessionId) as SessionRow | undefined;
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
      .prepare("INSERT INTO sessions (topic, mode) VALUES (?, ?)")
      .run(message.slice(0, 200), mode);
    session = { id: Number(info.lastInsertRowid), mode: mode!, sdk_session_id: null };
    prompt = `techtalk ${flag} ${message}`;
  }

  db.prepare(
    "INSERT INTO messages (session_id, role, content) VALUES (?, 'user', ?)"
  ).run(session.id, message);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const startMs = Date.now();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (ev: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));

      let assistantText = "";
      let sdkSessionId = session.sdk_session_id;

      try {
        const q = query({
          prompt,
          options: {
            cwd: OUTPUT_DIR,
            ...(sdkSessionId ? { resume: sdkSessionId } : {}),
            // 개인용 단일 사용자 도구: 스킬의 파일쓰기(산출물)를 막지 않는다
            permissionMode: "bypassPermissions",
            // ~/.claude/skills 의 techtalk 스킬을 로컬과 동일하게 로드
            settingSources: ["user"],
            includePartialMessages: true,
            // 컨테이너에선 standalone 번들이 SDK 네이티브 바이너리를 누락하므로
            // 이미지에 설치된 글로벌 CLI를 명시 (로컬 개발은 미설정 → SDK 기본값)
            ...(process.env.CLAUDE_CODE_PATH
              ? { pathToClaudeCodeExecutable: process.env.CLAUDE_CODE_PATH }
              : {}),
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
          }
        }

        db.prepare("UPDATE sessions SET sdk_session_id = ? WHERE id = ?").run(
          sdkSessionId,
          session.id
        );
        if (assistantText) {
          db.prepare(
            "INSERT INTO messages (session_id, role, content) VALUES (?, 'assistant', ?)"
          ).run(session.id, assistantText);
        }

        const artifacts = ingestNewArtifacts(session.id, startMs);
        send({ type: "done", sessionId: session.id, artifacts });
      } catch (e) {
        send({
          type: "error",
          message: e instanceof Error ? e.message : String(e),
        });
      } finally {
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
