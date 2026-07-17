import { parseTaxonomy } from "@/lib/taxonomy";
import { getCurrentUser } from "@/lib/webauth";
import { ensureUserRuntime } from "@/lib/userenv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 사용자별 live taxonomy (각자의 진도 ✅가 반영된 트리)
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const rt = ensureUserRuntime(user);
  return Response.json({ tree: parseTaxonomy(rt.home) });
}
