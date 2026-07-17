import crypto from "node:crypto";
import { cookies } from "next/headers";
import { db } from "./db";

/**
 * 웹 로그인(신원)과 구독 토큰(모델 권한)은 분리된 축이다.
 * - 웹 로그인: 아이디/비번 → httpOnly 쿠키 세션 (여기)
 * - 구독 토큰: 사용자별 setup-token 바인딩 (lib/reauth.ts) — 폴백 없음
 */

const COOKIE_NAME = "tt_session";

export interface WebUser {
  id: number;
  username: string;
  home_dir: string;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  return crypto.timingSafeEqual(
    Buffer.from(hash, "hex"),
    crypto.scryptSync(password, salt, 64)
  );
}

/**
 * 사용자 생성. 모든 사용자는 격리된 홈을 갖는다.
 * 레거시(단일 사용자 시절) 데이터 이관은 자동으로 하지 않는다 —
 * 관리자가 대상 계정을 지정해 /api/admin/migrate-legacy 로 명시 실행.
 */
export function createUser(username: string, password: string): WebUser {
  const base = process.env.HOME ?? "/home/app";
  const homeDir = `${base}/users/${username}`;

  const info = db
    .prepare(
      "INSERT INTO users (username, password_hash, home_dir) VALUES (?, ?, ?)"
    )
    .run(username, hashPassword(password), homeDir);
  return { id: Number(info.lastInsertRowid), username, home_dir: homeDir };
}

export function loginUser(username: string, password: string): string | null {
  const row = db
    .prepare("SELECT id, password_hash FROM users WHERE username = ?")
    .get(username) as { id: number; password_hash: string } | undefined;
  if (!row || !verifyPassword(password, row.password_hash)) return null;

  const token = crypto.randomBytes(32).toString("hex");
  db.prepare("INSERT INTO web_sessions (token, user_id) VALUES (?, ?)").run(
    token,
    row.id
  );
  return token;
}

export async function getCurrentUser(): Promise<WebUser | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT u.id, u.username, u.home_dir FROM web_sessions s
       JOIN users u ON u.id = s.user_id WHERE s.token = ?`
    )
    .get(token) as WebUser | undefined;
  return row ?? null;
}

export async function destroyCurrentSession(): Promise<void> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (token) db.prepare("DELETE FROM web_sessions WHERE token = ?").run(token);
}

export function sessionCookie(token: string): string {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000`;
}

export function clearedCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
