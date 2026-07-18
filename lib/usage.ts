/**
 * 구독 계정 사용량 HUD — SDK의 실험적 usage 컨트롤 메서드
 * (CLI `/usage`가 쓰는 것과 동일한 데이터, five_hour/seven_day 이미 구분되어 옴)로
 * 조회한 값을 사용자별로 저장해 두었다가 HUD가 읽는다.
 *
 * (rate_limit_event 스트림 이벤트는 한도 근접 시에만 utilization을 실어 보내고
 * 평상시엔 그 필드 자체가 없어 신뢰할 수 없었다 — 실제 페이로드 로그로 확인 후 폐기.)
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

/** usage_EXPERIMENTAL_...().rate_limits 중 HUD가 쓰는 부분 */
export interface RateLimitsSnapshot {
  five_hour?: { utilization: number | null; resets_at: string | null } | null;
  seven_day?: { utilization: number | null; resets_at: string | null } | null;
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
    return {}; // 손상된 JSON은 버리고 다음 조회로 재구축
  }
}

/** 대화 턴이 끝난 뒤 조회한 사용량 스냅샷 저장 — 온 창만 갱신, 없는 창은 이전 값 유지 */
export function saveUsageSnapshot(userId: number, rateLimits: RateLimitsSnapshot) {
  const stored = readStored(userId);
  let changed = false;

  for (const key of ["five_hour", "seven_day"] as const) {
    const w = rateLimits[key];
    if (w && typeof w.utilization === "number") {
      stored[key] = { utilization: w.utilization, resetsAt: w.resets_at ?? null };
      changed = true;
    }
  }

  if (changed) {
    db.prepare("UPDATE users SET rate_limits = ? WHERE id = ?").run(
      JSON.stringify(stored),
      userId
    );
  }
}

/** 저장된 사용량 조회 — 한 번도 못 받았으면 stale */
export function readStoredUsage(userId: number): UsageHud {
  const stored = readStored(userId);
  const fiveHour = stored.five_hour ?? null;
  const sevenDay = stored.seven_day ?? null;
  return { stale: !fiveHour && !sevenDay, fiveHour, sevenDay };
}
