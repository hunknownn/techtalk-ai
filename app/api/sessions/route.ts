import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 최근 세션 목록 (이어가기 선택용)
export async function GET() {
  const sessions = db
    .prepare(
      "SELECT id, topic, mode, created_at FROM sessions ORDER BY id DESC LIMIT 30"
    )
    .all();
  return Response.json({ sessions });
}
