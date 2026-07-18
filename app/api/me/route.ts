import { getCurrentUser } from "@/lib/webauth";
import { ensureUserRuntime, readUserToken } from "@/lib/userenv";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_MODELS = ["default", "sonnet", "opus", "haiku"];

// 현재 로그인 사용자 + 구독 연결·온보딩 여부 (진입 게이트가 사용)
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const rt = ensureUserRuntime(user);
  const row = db
    .prepare("SELECT onboarded, default_model FROM users WHERE id = ?")
    .get(user.id) as { onboarded: number; default_model: string | null } | undefined;
  return Response.json({
    user: { id: user.id, username: user.username },
    subscriptionBound: readUserToken(rt) !== null,
    onboarded: (row?.onboarded ?? 0) === 1,
    defaultModel: row?.default_model ?? "default",
  });
}

// 모델 선호값 저장 (기기·브라우저 안 가리고 계정에 귀속)
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { defaultModel } = (await req.json()) as { defaultModel?: string };
  if (!defaultModel || !VALID_MODELS.includes(defaultModel)) {
    return Response.json({ error: "invalid defaultModel" }, { status: 400 });
  }
  db.prepare("UPDATE users SET default_model = ? WHERE id = ?").run(
    defaultModel,
    user.id
  );
  return Response.json({ ok: true });
}
