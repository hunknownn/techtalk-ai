/**
 * 구독 계정 사용량 HUD — 본인 장기 토큰으로 조회.
 * (기본 인증 폴백 없음: 토큰 미연결이면 stale)
 */

export interface UsageWindow {
  utilization: number;
  resetsAt: string | null;
}

export interface UsageHud {
  stale: boolean;
  fiveHour: UsageWindow | null;
  sevenDay: UsageWindow | null;
}

interface OauthWindow {
  utilization?: number;
  resets_at?: string;
}

export async function fetchUsageHud(token: string | null): Promise<UsageHud> {
  if (!token) return { stale: true, fiveHour: null, sevenDay: null };

  const res = await fetch("https://api.anthropic.com/api/oauth/usage", {
    headers: {
      Authorization: `Bearer ${token}`,
      "anthropic-beta": "oauth-2025-04-20",
    },
    cache: "no-store",
  });

  if (!res.ok) return { stale: true, fiveHour: null, sevenDay: null };

  const data = (await res.json()) as {
    five_hour?: OauthWindow;
    seven_day?: OauthWindow;
  };
  const toWindow = (w?: OauthWindow): UsageWindow | null =>
    w && typeof w.utilization === "number"
      ? { utilization: w.utilization, resetsAt: w.resets_at ?? null }
      : null;

  return {
    stale: false,
    fiveHour: toWindow(data.five_hour),
    sevenDay: toWindow(data.seven_day),
  };
}
