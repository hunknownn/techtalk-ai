import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/webauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 최근 세션 목록 (본인 것만)
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const sessions = db
    .prepare(
      "SELECT id, topic, mode, created_at FROM sessions WHERE deleted = 0 AND user_id = ? ORDER BY id DESC LIMIT 30"
    )
    .all(user.id);
  return Response.json({ sessions });
}
