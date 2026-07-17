import { createUser } from "@/lib/webauth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 가입 전용 코드 (관리 코드와 분리). 미설정이면 로컬 개발로 간주해 통과.
function signupCodeOk(req: Request): boolean {
  const code = process.env.TECHTALK_SIGNUP_CODE;
  if (!code) return true;
  return req.headers.get("x-signup-code") === code;
}

// 사용자 생성. 최초 사용자는 소유자로 레거시 데이터를 이관받음.
export async function POST(req: Request) {
  if (!signupCodeOk(req)) {
    return Response.json({ error: "가입 코드가 올바르지 않습니다" }, { status: 401 });
  }
  const { username, password } = (await req.json()) as {
    username?: string;
    password?: string;
  };
  if (!username?.match(/^[a-z0-9_-]{2,20}$/) || !password || password.length < 8) {
    return Response.json(
      { error: "username: 소문자/숫자 2-20자, password: 8자 이상" },
      { status: 400 }
    );
  }

  const exists = db
    .prepare("SELECT 1 FROM users WHERE username = ?")
    .get(username);
  if (exists) {
    return Response.json({ error: "이미 존재하는 아이디" }, { status: 409 });
  }

  try {
    const user = createUser(username, password);
    return Response.json({ ok: true, user: { id: user.id, username } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg.includes("UNIQUE") ? 409 : 500;
    return Response.json(
      { error: status === 409 ? "이미 존재하는 아이디" : msg },
      { status }
    );
  }
}
