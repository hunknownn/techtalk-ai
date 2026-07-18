import { getCurrentUser } from "@/lib/webauth";
import { ensureUserRuntime, hasSubscription } from "@/lib/userenv";
import { runAgentText, extractJson } from "@/lib/agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface Area {
  name: string;
  source: "user" | "recommended";
  reason?: string;
}

// 스텝2: 관심 분야를 대주제로 정규화 + 함께 배우면 좋은 대주제 추천
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const rt = ensureUserRuntime(user);
  if (!hasSubscription(rt)) {
    return Response.json({ error: "no_subscription" }, { status: 403 });
  }

  const { interests } = (await req.json()) as { interests: string[] };
  if (!interests?.length) {
    return Response.json({ error: "interests required" }, { status: 400 });
  }

  const prompt = `너는 기술 학습 커리큘럼 설계자다. 사용자가 관심 분야를 자유 형식으로 입력했다.

입력: ${interests.join(", ")}

할 일:
1. 입력을 학습 "대주제(major area)"로 정규화한다 (예: "spring" → "백엔드", "리액트" → "프론트엔드").
2. 입력과 밀접히 연관되어 함께 배우면 좋은 대주제를 3~6개 추천한다. (프론트엔드 관심자면 백엔드와 다른 추천을 주는 등 맥락에 맞게)

출력은 JSON만. 설명·코드펜스 없이:
{"areas":[{"name":"백엔드","source":"user"},{"name":"분산 시스템","source":"recommended","reason":"한 줄 이유"}]}
입력에서 정규화된 것은 source:"user", 네 추천은 source:"recommended"에 reason 포함.`;

  try {
    const text = await runAgentText({ prompt, rt });
    const data = extractJson<{ areas: Area[] }>(text);
    return Response.json({ areas: data.areas ?? [] });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
