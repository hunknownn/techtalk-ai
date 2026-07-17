import { getCurrentUser } from "@/lib/webauth";
import { ensureUserRuntime, readUserToken } from "@/lib/userenv";
import { runAgentText, extractJson } from "@/lib/agent";
import { writeTaxonomy, type GenMajor } from "@/lib/taxonomyGen";
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
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const rt = ensureUserRuntime(user);
  const token = readUserToken(rt);
  if (!token) return Response.json({ error: "no_subscription" }, { status: 403 });

  const { areas } = (await req.json()) as { areas: AreaSpec[] };
  const valid = (areas ?? []).filter((a) => a.name && a.levels?.length);
  if (valid.length === 0) {
    return Response.json({ error: "areas required" }, { status: 400 });
  }

  const areaLines = valid
    .map((a) => `- ${a.name}: 레벨 [${a.levels.sort().join(", ")}]`)
    .join("\n");

  const prompt = `너는 기술 학습 커리큘럼(주제 트리)을 설계한다.

레벨 정의:
- 레벨1 = 초급(입문, 개념 이해)
- 레벨2 = 중급(실무 1~3년, 적용과 트레이드오프)
- 레벨3 = 고급(10년차 실무/대규모 시스템 설계, 내부 동작·실패 모드·엣지케이스)

아래 각 대주제에 대해, 지정된 레벨 범위에 맞는 중주제와 소주제를 생성하라.
- 여러 레벨이 지정되면 그 범위를 모두 아우른다 (초급~고급 사다리).
- 소주제는 구체적이고 딥다이브 가능한 항목으로 (예: "트랜잭션 격리 수준과 이상 현상", "B-Tree vs LSM-Tree 인덱스 내부구조").
- 각 대주제당 중주제 3~6개, 중주제당 소주제 5~10개.
- 학습 사다리 순서(쉬운→어려운)로 배열.

입력 대주제와 레벨:
${areaLines}

출력은 JSON만. 설명·코드펜스 없이:
{"topics":[{"major":"백엔드","mids":[{"mid":"CS 기초","subs":["소주제1","소주제2"]}]}]}`;

  try {
    const text = await runAgentText({ prompt, rt, token });
    const data = extractJson<{ topics: GenMajor[] }>(text);
    if (!data.topics?.length) throw new Error("빈 트리 생성됨");

    writeTaxonomy(rt, data.topics);
    db.prepare("UPDATE users SET onboarded = 1 WHERE id = ?").run(user.id);

    return Response.json({ tree: parseTaxonomy(rt.home) });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
