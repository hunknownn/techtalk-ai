import { parseTaxonomy } from "@/lib/taxonomy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 메인 화면 좌측 주제 트리용
export async function GET() {
  return Response.json({ tree: parseTaxonomy() });
}
