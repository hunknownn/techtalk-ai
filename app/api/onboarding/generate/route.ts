import { getCurrentUser } from "@/lib/webauth";
import { ensureUserRuntime, hasSubscription } from "@/lib/userenv";
import { runAgentText, extractJson } from "@/lib/agent";
import { writeTaxonomy, type GenMajor } from "@/lib/taxonomyGen";
import { majorTopicPrompt } from "@/lib/taxonomyPrompt";
import { parseTaxonomy } from "@/lib/taxonomy";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

interface AreaSpec {
  name: string;
  levels: number[];
}

// 스텝4: 대주제·레벨에 맞춰 중/소주제 생성 → taxonomy.md 기록
//
// 대주제 하나에 전체 트리를 몰아 요청하면 응답이 60~120초 걸려, 앞단
// Cloudflare(100초 하드 타임아웃)에 잘려 524 HTML이 돌아온다(→ 클라 JSON 파싱 실패).
// 그래서 SSE로 열고, 대주제 단위로 나눠 claude를 호출하며 진행률을 흘려보낸다.
// 매 대주제마다 이벤트가 흐르고 15초 하트비트도 있어 유휴 차단에 걸리지 않는다.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const rt = ensureUserRuntime(user);
  if (!hasSubscription(rt)) {
    return Response.json({ error: "no_subscription" }, { status: 403 });
  }

  const { areas } = (await req.json()) as { areas: AreaSpec[] };
  const valid = (areas ?? []).filter((a) => a.name && a.levels?.length);
  if (valid.length === 0) {
    return Response.json({ error: "areas required" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (ev: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
      // Cloudflare 100초 유휴 차단 방지: 한 대주제 생성이 길어져도 끊기지 않게
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          /* 이미 닫힘 */
        }
      }, 15000);

      try {
        const total = valid.length;
        // 헤더·첫 바이트 즉시 플러시 (첫 대주제 생성 대기 동안 연결 유지)
        send({ type: "progress", done: 0, total, current: valid[0].name });

        const topics: GenMajor[] = [];
        for (let i = 0; i < valid.length; i++) {
          const a = valid[i];
          send({ type: "progress", done: i, total, current: a.name });

          // 대주제 1개 생성 (형식이 흔들려 파싱 실패하면 1회 재시도)
          let major: GenMajor | null = null;
          for (let attempt = 0; attempt < 2 && !major; attempt++) {
            try {
              const text = await runAgentText({
                prompt: majorTopicPrompt(a.name, a.levels),
                rt,
              });
              const parsed = extractJson<GenMajor>(text);
              if (parsed?.mids?.length) {
                // 대주제명은 사용자가 고른 값으로 고정 (모델이 바꾸지 않도록)
                major = { major: a.name, mids: parsed.mids };
              }
            } catch {
              /* 재시도 */
            }
          }
          if (!major) throw new Error(`'${a.name}' 대주제 생성 실패`);
          topics.push(major);
        }

        writeTaxonomy(rt, topics);
        db.prepare("UPDATE users SET onboarded = 1 WHERE id = ?").run(user.id);
        send({ type: "done", tree: parseTaxonomy(rt.home) });
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
