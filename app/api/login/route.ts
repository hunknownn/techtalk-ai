import { loginUser, sessionCookie } from "@/lib/webauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { username, password } = (await req.json()) as {
    username?: string;
    password?: string;
  };
  if (!username || !password) {
    return Response.json({ error: "아이디/비밀번호를 입력하세요" }, { status: 400 });
  }
  const token = loginUser(username, password);
  if (!token) {
    return Response.json(
      { error: "아이디 또는 비밀번호가 올바르지 않습니다" },
      { status: 401 }
    );
  }
  return Response.json(
    { ok: true },
    { headers: { "Set-Cookie": sessionCookie(token) } }
  );
}
