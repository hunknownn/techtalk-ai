import { getCurrentUser } from "@/lib/webauth";
import { ensureUserRuntime } from "@/lib/userenv";
import { startReauth, submitReauthCode, readReauthState } from "@/lib/reauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// action: "start" → detached 드라이버 구동 후 인증 URL 대기
// action: "code"  → 본인 Claude 계정 로그인 후 받은 코드 제출
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const rt = ensureUserRuntime(user);
  const { action, code } = (await req.json()) as {
    action: "start" | "code";
    code?: string;
  };

  try {
    if (action === "start") {
      startReauth(user.id, rt.tokenFile);
    } else if (action === "code") {
      if (!code?.trim()) {
        return Response.json({ error: "code is required" }, { status: 400 });
      }
      submitReauthCode(user.id, code);
    } else {
      return Response.json({ error: "unknown action" }, { status: 400 });
    }
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 409 }
    );
  }
  return Response.json({ state: readReauthState(user.id) });
}
