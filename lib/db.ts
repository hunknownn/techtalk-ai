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
  // 마이그레이션: 기존 DB에 없는 컬럼 추가 (이미 있으면 무시)
  for (const ddl of [
    "ALTER TABLE sessions ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE sessions ADD COLUMN model TEXT",
    "ALTER TABLE sessions ADD COLUMN context_tokens INTEGER",
  ]) {
    try {
      db.exec(ddl);
    } catch {
      /* 이미 존재 */
    }
  }
  return db;
}

// Next.js 개발모드 핫리로드 시 커넥션 중복 생성 방지
const g = globalThis as unknown as { __techtalkDb?: Database.Database };
export const db = g.__techtalkDb ?? (g.__techtalkDb = createDb());
