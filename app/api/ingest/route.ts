import { ingestNewArtifacts } from "@/lib/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ~/techtalk 전체 재스캔: 웹 도입 이전(로컬 시절) 산출물을 DB로 편입할 때 사용
export async function POST() {
  const artifacts = ingestNewArtifacts(null, 0);
  return Response.json({ count: artifacts.length, artifacts });
}
