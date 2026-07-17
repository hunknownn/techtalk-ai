import { isAdminAuthorized } from "@/lib/admin-guard";
import { createUser } from "@/lib/webauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 사용자 생성 (관리 코드 필요). 최초 사용자는 소유자로 레거시 데이터를 이관받음.
export async function POST(req: Request) {
  if (!isAdminAuthorized(req)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
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
