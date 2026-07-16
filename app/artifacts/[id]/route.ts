import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

interface ArtifactRow {
  kind: "html" | "note";
  content: string;
}

// 아티팩트 원문 서빙: html은 그대로 렌더, 노트는 마크다운 텍스트로
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const row = db
    .prepare("SELECT kind, content FROM artifacts WHERE id = ?")
    .get(Number(id)) as ArtifactRow | undefined;

  if (!row) return new Response("Not found", { status: 404 });

  const contentType =
    row.kind === "html"
      ? "text/html; charset=utf-8"
      : "text/plain; charset=utf-8";
  return new Response(row.content, {
    headers: { "Content-Type": contentType },
  });
}
