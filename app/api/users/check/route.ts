import { NextRequest } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 아이디 실시간 중복·형식 검사 (가입 화면용)
export async function GET(req: NextRequest) {
  const username = req.nextUrl.searchParams.get("username") ?? "";
  if (!username.match(/^[a-z0-9_-]{2,20}$/)) {
    return Response.json({ ok: false, reason: "형식: 소문자/숫자 2-20자" });
  }
  const taken = db.prepare("SELECT 1 FROM users WHERE username = ?").get(username);
  return Response.json(
    taken ? { ok: false, reason: "이미 사용 중인 아이디" } : { ok: true }
  );
}
