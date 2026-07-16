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
    .prepare("SELECT id, topic, mode, created_at FROM sessions WHERE id = ?")
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
