import { ingestNewArtifacts } from "@/lib/ingest";
import { getCurrentUser } from "@/lib/webauth";
import { ensureUserRuntime } from "@/lib/userenv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 본인 산출물 디렉토리 전체 재스캔 (과거 파일 편입용)
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const rt = ensureUserRuntime(user);
  const artifacts = ingestNewArtifacts(null, 0, {
    outputDir: rt.outputDir,
    userId: user.id,
  });
  return Response.json({ count: artifacts.length, artifacts });
}
