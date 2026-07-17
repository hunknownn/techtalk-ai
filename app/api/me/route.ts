import { getCurrentUser } from "@/lib/webauth";
import { ensureUserRuntime, readUserToken } from "@/lib/userenv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 현재 로그인 사용자 + 구독 토큰 연결 여부 (채팅 진입 게이트가 사용)
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const rt = ensureUserRuntime(user);
  return Response.json({
    user: { id: user.id, username: user.username },
    subscriptionBound: readUserToken(rt) !== null,
  });
}
