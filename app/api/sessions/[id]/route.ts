import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/webauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 세션 복원: 메시지 이력 + 생성된 산출물까지 함께 반환 (본인 것만)
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const session = db
    .prepare(
      "SELECT id, topic, mode, model, context_tokens, context_max_tokens, created_at FROM sessions WHERE id = ? AND deleted = 0 AND user_id = ?"
    )
    .get(Number(id), user.id);
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

// 세션 숨김(소프트 삭제): 본인 것만
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const result = db
    .prepare("UPDATE sessions SET deleted = 1 WHERE id = ? AND user_id = ?")
    .run(Number(id), user.id);
  if (result.changes === 0) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  return Response.json({ ok: true });
}
