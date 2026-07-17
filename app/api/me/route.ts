import { getCurrentUser } from "@/lib/webauth";
import { ensureUserRuntime, readUserToken } from "@/lib/userenv";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 현재 로그인 사용자 + 구독 연결·온보딩 여부 (진입 게이트가 사용)
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const rt = ensureUserRuntime(user);
  const row = db
    .prepare("SELECT onboarded FROM users WHERE id = ?")
    .get(user.id) as { onboarded: number } | undefined;
  return Response.json({
    user: { id: user.id, username: user.username },
    subscriptionBound: readUserToken(rt) !== null,
    onboarded: (row?.onboarded ?? 0) === 1,
  });
}
