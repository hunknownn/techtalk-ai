import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 세션 복원: 메시지 이력 + 생성된 산출물까지 함께 반환
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = db
    .prepare(
      "SELECT id, topic, mode, model, context_tokens, created_at FROM sessions WHERE id = ? AND deleted = 0"
    )
    .get(Number(id));
  if (!session) return Response.json({ error: "not found" }, { status: 404 });

  const messages = db
    .prepare(
      "SELECT role, content FROM messages WHERE session_id = ? ORDER BY id"
    )
    .all(Number(id));
  const artifacts = db
    .prepare(
      "SELECT id, title, kind FROM artifacts WHERE session_id = ? ORDER BY id"
    )
    .all(Number(id));

  return Response.json({ session, messages, artifacts });
}

// 세션 숨김(소프트 삭제): 목록·복원에서 제외되지만 DB와 산출물은 보존
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = db
    .prepare("UPDATE sessions SET deleted = 1 WHERE id = ?")
    .run(Number(id));
  if (result.changes === 0) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  return Response.json({ ok: true });
}
