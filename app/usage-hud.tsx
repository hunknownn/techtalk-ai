"use client";

import { useCallback, useEffect, useState } from "react";

interface UsageWindow {
  utilization: number;
  resetsAt: string | null;
}
interface UsageHud {
  stale: boolean;
  fiveHour: UsageWindow | null;
  sevenDay: UsageWindow | null;
}

function pctColor(p: number) {
  if (p >= 90) return "text-red-500";
  if (p >= 70) return "text-amber-500";
  return "text-neutral-500";
}

function resetLabel(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return ` (리셋 ${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")})`;
}

/**
 * 계정 사용량 HUD: 5시간 세션 / 주간 사용률 + 현재 세션 컨텍스트 크기.
 * refreshKey가 바뀔 때(대화 턴 종료)마다 갱신한다.
 */
export function UsageHud({
  refreshKey,
  contextTokens,
}: {
  refreshKey: number;
  contextTokens: number | null;
}) {
  const [usage, setUsage] = useState<UsageHud | null>(null);

  const refresh = useCallback(() => {
    fetch("/api/usage")
      .then((r) => r.json())
      .then(setUsage)
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh, refreshKey]);

  if (!usage) return null;

  return (
    <div className="flex items-center gap-3 text-[11px]">
      {usage.stale ? (
        <span
          className="text-neutral-400"
          title="토큰 갱신 대기 중 — 다음 대화가 돌면 자동 갱신됩니다"
        >
          사용량 −
        </span>
      ) : (
        <>
          {usage.fiveHour && (
            <span
              className={pctColor(usage.fiveHour.utilization)}
              title={`5시간 세션 사용률${resetLabel(usage.fiveHour.resetsAt)}`}
            >
              5h {Math.round(usage.fiveHour.utilization)}%
            </span>
          )}
          {usage.sevenDay && (
            <span
              className={pctColor(usage.sevenDay.utilization)}
              title={`주간 사용률${resetLabel(usage.sevenDay.resetsAt)}`}
            >
              주간 {Math.round(usage.sevenDay.utilization)}%
            </span>
          )}
        </>
      )}
      {contextTokens !== null && (
        <span
          className="text-neutral-500"
          title="현재 세션의 컨텍스트 크기 (마지막 턴 입력 토큰, 캐시 포함)"
        >
          ctx {contextTokens >= 1000 ? `${Math.round(contextTokens / 1000)}k` : contextTokens}
        </span>
      )}
    </div>
  );
}
