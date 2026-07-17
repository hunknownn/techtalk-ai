import fs from "node:fs";
import path from "node:path";
import { isAdminAuthorized } from "@/lib/admin-guard";
import { db } from "@/lib/db";
import { ensureUserRuntime } from "@/lib/userenv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 레거시(단일 사용자 시절) 데이터를 지정한 계정으로 이관한다. 관리 코드 필요.
 * - DB: user_id 없는 sessions/artifacts → 대상 사용자
 * - 파일: 파드 기본 홈의 ~/techtalk 산출물·taxonomy → 대상 사용자 홈
 * 운영자가 본인 계정을 만든 뒤 그 username으로 1회 호출한다.
 */
export async function POST(req: Request) {
  if (!isAdminAuthorized(req)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const { username } = (await req.json()) as { username?: string };
  if (!username) {
    return Response.json({ error: "username required" }, { status: 400 });
  }

  const user = db
    .prepare("SELECT id, username, home_dir FROM users WHERE username = ?")
    .get(username) as
    | { id: number; username: string; home_dir: string }
    | undefined;
  if (!user) return Response.json({ error: "user not found" }, { status: 404 });

  const rt = ensureUserRuntime(user);

  // 1) DB 소유권 이관 (아직 주인 없는 레거시 행만)
  const s = db
    .prepare("UPDATE sessions SET user_id = ? WHERE user_id IS NULL")
    .run(user.id);
  const a = db
    .prepare("UPDATE artifacts SET user_id = ? WHERE user_id IS NULL")
    .run(user.id);

  // 2) 레거시 파일 이관 (파드 기본 홈 → 대상 사용자 홈)
  const legacyHome = process.env.HOME ?? "/home/app";
  let filesMoved = false;
  if (legacyHome !== user.home_dir) {
    const legacyTechtalk = path.join(legacyHome, "techtalk");
    if (fs.existsSync(legacyTechtalk)) {
      fs.cpSync(legacyTechtalk, rt.outputDir, { recursive: true, force: true });
      filesMoved = true;
    }
    // 소유자 진행 표시(✅)가 담긴 taxonomy 보존
    const legacyTaxonomy = path.join(
      legacyHome,
      ".claude",
      "skills",
      "techtalk",
      "taxonomy.md"
    );
    const destTaxonomy = path.join(
      rt.home,
      ".claude",
      "skills",
      "techtalk",
      "taxonomy.md"
    );
    if (fs.existsSync(legacyTaxonomy)) {
      fs.mkdirSync(path.dirname(destTaxonomy), { recursive: true });
      fs.copyFileSync(legacyTaxonomy, destTaxonomy);
    }
    // 산출물 source_path를 새 경로로 보정 (재수집 중복 방지)
    db.prepare(
      "UPDATE artifacts SET source_path = replace(source_path, ?, ?) WHERE user_id = ?"
    ).run(legacyTechtalk, rt.outputDir, user.id);
  }

  return Response.json({
    ok: true,
    migratedTo: user.username,
    sessions: s.changes,
    artifacts: a.changes,
    filesMoved,
  });
}
