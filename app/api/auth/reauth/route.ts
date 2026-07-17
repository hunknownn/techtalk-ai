import { getCurrentUser } from "@/lib/webauth";
import { ensureUserRuntime } from "@/lib/userenv";
import { getReauthSession } from "@/lib/reauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// action: "start" → setup-token 구동 후 인증 URL 대기
// action: "code"  → 본인 Claude 계정 로그인 후 받은 코드 제출
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const rt = ensureUserRuntime(user);
  const session = getReauthSession(user.id, rt.tokenFile);
  const { action, code } = (await req.json()) as {
    action: "start" | "code";
    code?: string;
  };

  try {
    if (action === "start") {
      session.start();
    } else if (action === "code") {
      if (!code?.trim()) {
        return Response.json({ error: "code is required" }, { status: 400 });
      }
      session.submitCode(code);
    } else {
      return Response.json({ error: "unknown action" }, { status: 400 });
    }
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 409 }
    );
  }
  return Response.json({ state: session.state });
}
