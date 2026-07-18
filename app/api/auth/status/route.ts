import { getCurrentUser } from "@/lib/webauth";
import { ensureUserRuntime, subscriptionInfo } from "@/lib/userenv";
import { readReauthState } from "@/lib/reauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 현재 로그인 사용자의 구독 연결 상태 + 진행 중 연결 플로우
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const rt = ensureUserRuntime(user);
  const info = subscriptionInfo(rt);

  return Response.json({
    username: user.username,
    token: {
      exists: info !== null,
      // CLI가 토큰을 갱신할 때마다 파일이 다시 쓰이므로 "발급"이 아닌 "갱신" 시각
      updatedAt: info?.updatedAt ?? null,
      subscriptionType: info?.subscriptionType ?? null,
    },
    reauth: readReauthState(user.id),
  });
}
