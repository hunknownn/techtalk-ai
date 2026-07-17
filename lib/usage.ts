import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * 구독 계정 사용량 HUD 데이터.
 * Claude Code가 /usage에서 쓰는 OAuth 엔드포인트를 같은 토큰으로 조회한다.
 * 액세스 토큰이 stale이면(만료 후 CLI가 아직 안 돌았음) stale: true로 응답 —
 * 다음 대화가 돌면 CLI가 토큰을 갱신하므로 자연 회복된다.
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

export async function fetchUsageHud(): Promise<UsageHud> {
  let accessToken: string;
  try {
    accessToken = JSON.parse(
      fs.readFileSync(
        path.join(os.homedir(), ".claude", ".credentials.json"),
        "utf-8"
      )
    ).claudeAiOauth.accessToken;
  } catch {
    return { stale: true, fiveHour: null, sevenDay: null };
  }

  const res = await fetch("https://api.anthropic.com/api/oauth/usage", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "anthropic-beta": "oauth-2025-04-20",
    },
    // HUD는 실시간성이 중요하지 않음
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
