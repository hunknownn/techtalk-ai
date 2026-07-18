import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// 파드에선 TECHTALK_DATA_DIR=/data 로 PVC를 가리키고, 로컬에선 ./data 사용
const DATA_DIR = process.env.TECHTALK_DATA_DIR ?? path.join(process.cwd(), "data");

// 스킬이 산출물을 쓰는 디렉토리 (SKILL.md의 ~/techtalk 규약 그대로)
export const OUTPUT_DIR =
  process.env.TECHTALK_OUTPUT_DIR ?? path.join(os.homedir(), "techtalk");

function createDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(path.join(DATA_DIR, "techtalk.db"));
  db.pragma("journal_mode = WAL");
  // 동시 오픈(빌드 시 다중 워커, 런타임 경합) 시 즉시 실패 대신 대기
  db.pragma("busy_timeout = 5000");
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic TEXT,
      mode TEXT NOT NULL,
      sdk_session_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES sessions(id),
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS artifacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER REFERENCES sessions(id),
      title TEXT,
      slug TEXT,
      kind TEXT NOT NULL CHECK (kind IN ('html', 'note')),
      content TEXT NOT NULL,
      taxonomy_path TEXT,
      source_path TEXT UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  // 멀티유저: 사용자·웹세션 테이블
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      home_dir TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS web_sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  // 마이그레이션: 기존 DB에 없는 컬럼 추가 (이미 있으면 무시)
  for (const ddl of [
    "ALTER TABLE sessions ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE sessions ADD COLUMN model TEXT",
    "ALTER TABLE sessions ADD COLUMN context_tokens INTEGER",
    "ALTER TABLE sessions ADD COLUMN user_id INTEGER",
    "ALTER TABLE artifacts ADD COLUMN user_id INTEGER",
    "ALTER TABLE users ADD COLUMN onboarded INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE users ADD COLUMN rate_limits TEXT",
  ]) {
    try {
      db.exec(ddl);
    } catch {
      /* 이미 존재 */
    }
  }
  return db;
}

// Lazy 초기화: 모듈 import만으로 DB를 열지 않는다.
// (빌드 시 다중 워커가 모듈을 import하며 새 DB에 동시 마이그레이션 → 락 경합 방지.
//  런타임은 globalThis 싱글턴으로 핫리로드에도 커넥션 1개 유지)
const g = globalThis as unknown as { __techtalkDb?: Database.Database };
function getDb(): Database.Database {
  return g.__techtalkDb ?? (g.__techtalkDb = createDb());
}

// 첫 프로퍼티 접근(실제 쿼리) 시점에만 커넥션을 연다
export const db = new Proxy({} as Database.Database, {
  get(_t, prop) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const v = real[prop];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(real) : v;
  },
});
