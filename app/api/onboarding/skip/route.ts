import { getCurrentUser } from "@/lib/webauth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 온보딩 건너뛰기: 기존(시드) taxonomy 유지, 게이트만 해제
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  db.prepare("UPDATE users SET onboarded = 1 WHERE id = ?").run(user.id);
  return Response.json({ ok: true });
}
