import { isAdminAuthorized } from "@/lib/admin-guard";
import { reauthSession } from "@/lib/reauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// action: "start" → setup-token 구동 후 인증 URL 대기
// action: "code"  → 사용자가 브라우저 인증 후 받은 코드를 제출
export async function POST(req: Request) {
  if (!isAdminAuthorized(req)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const { action, code } = (await req.json()) as {
    action: "start" | "code";
    code?: string;
  };

  try {
    if (action === "start") {
      reauthSession.start();
    } else if (action === "code") {
      if (!code?.trim()) {
        return Response.json({ error: "code is required" }, { status: 400 });
      }
      reauthSession.submitCode(code);
    } else {
      return Response.json({ error: "unknown action" }, { status: 400 });
    }
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 409 }
    );
  }
  return Response.json({ state: reauthSession.state });
}
