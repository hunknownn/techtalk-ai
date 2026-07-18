/**
 * 구독 계정 사용량 HUD — SDK가 대화 스트림에 내려주는 rate_limit_event를
 * 사용자별로 저장해 두었다가 조회한다.
 * (별도 usage API 호출 없음: 첫 대화 턴이 돌기 전에는 stale)
 */

import { db } from "./db";

export interface UsageWindow {
  utilization: number;
  resetsAt: string | null;
}

export interface UsageHud {
  stale: boolean;
  fiveHour: UsageWindow | null;
  sevenDay: UsageWindow | null;
}

/** SDK rate_limit_event 페이로드 중 HUD가 쓰는 부분 */
export interface RateLimitInfoLike {
  rateLimitType?: string;
  utilization?: number;
  resetsAt?: number;
}

interface StoredRateLimits {
  five_hour?: UsageWindow;
  seven_day?: UsageWindow;
}

function readStored(userId: number): StoredRateLimits {
  const row = db
    .prepare("SELECT rate_limits FROM users WHERE id = ?")
    .get(userId) as { rate_limits: string | null } | undefined;
  try {
    return JSON.parse(row?.rate_limits ?? "{}") as StoredRateLimits;
  } catch {
    return {}; // 손상된 JSON은 버리고 다음 이벤트로 재구축
  }
}

function toIso(epoch?: number): string | null {
  if (typeof epoch !== "number") return null;
  // epoch가 초/밀리초 어느 단위로 와도 처리
  return new Date(epoch < 1e12 ? epoch * 1000 : epoch).toISOString();
}

/** 대화 스트림의 rate_limit_event를 저장 — HUD가 쓰는 five_hour/seven_day 창만 */
export function saveRateLimitEvent(userId: number, info: RateLimitInfoLike) {
  if (info.rateLimitType !== "five_hour" && info.rateLimitType !== "seven_day")
    return;
  if (typeof info.utilization !== "number") return;

  const stored = readStored(userId);
  stored[info.rateLimitType] = {
    utilization: info.utilization,
    resetsAt: toIso(info.resetsAt),
  };
  db.prepare("UPDATE users SET rate_limits = ? WHERE id = ?").run(
    JSON.stringify(stored),
    userId
  );
}

/** 저장된 사용량 조회 — 이벤트를 아직 한 번도 못 받았으면 stale */
export function readStoredUsage(userId: number): UsageHud {
  const stored = readStored(userId);
  const fiveHour = stored.five_hour ?? null;
  const sevenDay = stored.seven_day ?? null;
  return { stale: !fiveHour && !sevenDay, fiveHour, sevenDay };
}
