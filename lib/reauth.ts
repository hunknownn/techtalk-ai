import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * 파일 기반 구독 재인증. 실제 pty 프로세스는 detached 드라이버
 * (reauth-driver.cjs)가 돌리고, 여기서는 상태 파일만 읽고/쓴다.
 * → Next.js 요청 인스턴스가 갈려도 일관되게 동작 (메모리 세션 문제 해소).
 */

type Phase =
  | "idle"
  | "starting"
  | "waiting_code"
  | "exchanging"
  | "done"
  | "error";

export interface ReauthState {
  phase: Phase;
  url: string | null;
  message: string | null;
}

const DATA_DIR =
  process.env.TECHTALK_DATA_DIR ?? path.join(process.cwd(), "data");

function workdir(userId: number): string {
  return path.join(DATA_DIR, "reauth", String(userId));
}

function readFileSafe(p: string): string | null {
  try {
    return fs.readFileSync(p, "utf8").trim();
  } catch {
    return null;
  }
}

export function startReauth(userId: number, tokenFile: string): void {
  const wd = workdir(userId);
  fs.mkdirSync(wd, { recursive: true });
  // 이전 흔적 정리 후 시작
  for (const f of ["url.txt", "code.txt", "phase.txt"]) {
    try {
      fs.unlinkSync(path.join(wd, f));
    } catch {
      /* 없으면 무시 */
    }
  }
  fs.writeFileSync(
    path.join(wd, "phase.txt"),
    JSON.stringify({ phase: "starting", message: null })
  );

  const driver = path.join(process.cwd(), "reauth-driver.cjs");
  const child = spawn(process.execPath, [driver, wd, tokenFile], {
    cwd: process.cwd(),
    env: process.env,
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

export function readReauthState(userId: number): ReauthState {
  const wd = workdir(userId);
  let phase: Phase = "idle";
  let message: string | null = null;
  const phaseRaw = readFileSafe(path.join(wd, "phase.txt"));
  if (phaseRaw) {
    try {
      const parsed = JSON.parse(phaseRaw) as { phase: Phase; message: string };
      phase = parsed.phase;
      message = parsed.message ?? null;
    } catch {
      /* 손상 시 idle */
    }
  }
  const url = readFileSafe(path.join(wd, "url.txt"));
  return { phase, url: phase === "waiting_code" ? url : null, message };
}

export function submitReauthCode(userId: number, code: string): void {
  const state = readReauthState(userId);
  if (state.phase !== "waiting_code") {
    throw new Error("코드를 받을 단계가 아닙니다. 연결을 먼저 시작하세요.");
  }
  fs.writeFileSync(path.join(workdir(userId), "code.txt"), code.trim());
}
