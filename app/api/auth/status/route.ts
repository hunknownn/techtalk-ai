import fs from "node:fs";
import { getCurrentUser } from "@/lib/webauth";
import { ensureUserRuntime } from "@/lib/userenv";
import { getReauthSession } from "@/lib/reauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 현재 로그인 사용자의 구독 토큰 상태 + 진행 중 연결 플로우
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const rt = ensureUserRuntime(user);
  let token: { exists: boolean; createdAt: string | null } = {
    exists: false,
    createdAt: null,
  };
  try {
    const parsed = JSON.parse(fs.readFileSync(rt.tokenFile, "utf-8"));
    token = { exists: true, createdAt: parsed.createdAt ?? null };
  } catch {
    /* 미연결 */
  }

  return Response.json({
    username: user.username,
    token,
    reauth: getReauthSession(user.id, rt.tokenFile).state,
  });
}
