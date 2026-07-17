"use client";

import { useState } from "react";

interface Area {
  name: string;
  source: "user" | "recommended";
  reason?: string;
  accepted: boolean;
  levels: number[];
}

const LEVELS = [
  { n: 1, label: "L1 초급", desc: "입문·개념" },
  { n: 2, label: "L2 중급", desc: "실무 1~3년" },
  { n: 3, label: "L3 고급", desc: "10년차·설계" },
];

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [interestInput, setInterestInput] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
    current: string;
  } | null>(null);

  function addInterest() {
    const v = interestInput.trim();
    if (v && !interests.includes(v)) setInterests([...interests, v]);
    setInterestInput("");
  }

  // 스텝1 → 2: 추천 받기
  async function fetchRecommend() {
    if (interests.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interests }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "추천 실패");
      setAreas(
        (data.areas as Omit<Area, "accepted" | "levels">[]).map((a) => ({
          ...a,
          accepted: a.source === "user", // 내 입력은 기본 선택, 추천은 선택 안 됨
          levels: [1, 2],
        }))
      );
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function toggleArea(i: number) {
    setAreas((prev) =>
      prev.map((a, idx) => (idx === i ? { ...a, accepted: !a.accepted } : a))
    );
  }
  function toggleLevel(i: number, n: number) {
    setAreas((prev) =>
      prev.map((a, idx) =>
        idx === i
          ? {
              ...a,
              levels: a.levels.includes(n)
                ? a.levels.filter((l) => l !== n)
                : [...a.levels, n],
            }
          : a
      )
    );
  }

  // 스텝3 → 생성
  async function generate() {
    const selected = areas.filter((a) => a.accepted);
    if (selected.some((a) => a.levels.length === 0)) {
      setError("각 대주제에 레벨을 하나 이상 선택하세요");
      return;
    }
    setBusy(true);
    setError(null);
    setProgress({ done: 0, total: selected.length, current: selected[0]?.name ?? "" });
    try {
      const res = await fetch("/api/onboarding/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          areas: selected.map((a) => ({ name: a.name, levels: a.levels })),
        }),
      });
      // 초기 검증 실패 등은 JSON 에러로 옴 (SSE 스트림이 아님)
      if (!res.ok || !res.body) {
        const t = await res.text();
        let msg = `생성 실패 (${res.status})`;
        try {
          msg = (JSON.parse(t).error as string) ?? msg;
        } catch {
          /* HTML/텍스트 에러면 상태코드만 */
        }
        throw new Error(msg);
      }

      // SSE 스트림 파싱: 대주제별 진행 이벤트 → 진행바, done → 이동
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let finished = false;
      while (!finished) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const chunks = buf.split("\n\n");
        buf = chunks.pop() ?? "";
        for (const chunk of chunks) {
          const dataLine = chunk
            .split("\n")
            .find((l) => l.startsWith("data:"));
          if (!dataLine) continue; // 하트비트 주석(: ping) 무시
          const ev = JSON.parse(dataLine.slice(5).trim());
          if (ev.type === "progress") {
            setProgress({ done: ev.done, total: ev.total, current: ev.current });
          } else if (ev.type === "done") {
            finished = true;
            window.location.href = "/dashboard";
          } else if (ev.type === "error") {
            throw new Error(ev.message ?? "생성 실패");
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
      setProgress(null);
    }
  }

  async function skip() {
    await fetch("/api/onboarding/skip", { method: "POST" });
    window.location.href = "/";
  }

  const selectedAreas = areas.filter((a) => a.accepted);

  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">학습 주제 설정</h1>
        <button onClick={skip} className="text-xs text-neutral-500 hover:underline">
          건너뛰기
        </button>
      </div>

      {/* 진행 표시 */}
      <div className="mb-6 flex gap-2 text-xs">
        {["관심 분야", "분야 확정", "레벨 설정"].map((label, i) => (
          <div
            key={label}
            className={`flex-1 rounded p-2 text-center ${
              step === i + 1
                ? "bg-blue-500 text-white"
                : step > i + 1
                  ? "bg-blue-500/20 text-blue-500"
                  : "bg-neutral-200 text-neutral-500 dark:bg-neutral-800"
            }`}
          >
            {i + 1}. {label}
          </div>
        ))}
      </div>

      {error && (
        <p className="mb-4 rounded border border-red-500/40 bg-red-500/5 p-2 text-sm text-red-500">
          {error}
        </p>
      )}

      {/* 스텝1: 관심 분야 입력 */}
      {step === 1 && (
        <section className="space-y-4">
          <p className="text-sm text-neutral-500">
            관심 있는 분야·주제를 자유롭게 입력하세요. 예: spring, db, cs, 대규모
            설계 / 또는 react, 렌더링 성능, 상태관리
          </p>
          <div className="flex gap-2">
            <input
              value={interestInput}
              onChange={(e) => setInterestInput(e.target.value)}
              onKeyDown={(e) => {
                // 한글 IME 조합 중 Enter는 무시 (마지막 글자 중복 추가 방지)
                if (e.nativeEvent.isComposing) return;
                if (e.key === "Enter") {
                  e.preventDefault();
                  addInterest();
                }
              }}
              placeholder="분야 입력 후 Enter"
              className="flex-1 rounded border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700"
            />
            <button
              onClick={addInterest}
              className="rounded border border-neutral-300 px-3 text-sm dark:border-neutral-700"
            >
              추가
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {interests.map((it) => (
              <span
                key={it}
                className="flex items-center gap-1 rounded-full bg-blue-500/10 px-3 py-1 text-sm text-blue-500"
              >
                {it}
                <button
                  onClick={() => setInterests(interests.filter((x) => x !== it))}
                  className="text-blue-400 hover:text-blue-600"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
          <button
            onClick={fetchRecommend}
            disabled={interests.length === 0 || busy}
            className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-40"
          >
            {busy ? "분석 중…" : "다음: 분야 분석·추천"}
          </button>
        </section>
      )}

      {/* 스텝2: 분야 확정 (추천 수용) */}
      {step === 2 && (
        <section className="space-y-3">
          <p className="text-sm text-neutral-500">
            AI가 정리한 대주제입니다. 추천 항목은 원하면 체크해 추가하세요.
          </p>
          {areas.map((a, i) => (
            <label
              key={a.name}
              className="flex cursor-pointer items-start gap-2 rounded-lg border border-neutral-200 p-3 text-sm dark:border-neutral-800"
            >
              <input
                type="checkbox"
                checked={a.accepted}
                onChange={() => toggleArea(i)}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">{a.name}</span>
                <span
                  className={`ml-2 text-xs ${a.source === "user" ? "text-emerald-500" : "text-neutral-400"}`}
                >
                  {a.source === "user" ? "내 입력" : "추천"}
                </span>
                {a.reason && (
                  <span className="block text-xs text-neutral-500">
                    {a.reason}
                  </span>
                )}
              </span>
            </label>
          ))}
          <div className="flex gap-2">
            <button
              onClick={() => setStep(1)}
              className="rounded border border-neutral-300 px-4 py-2 text-sm dark:border-neutral-700"
            >
              이전
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={selectedAreas.length === 0}
              className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-40"
            >
              다음: 레벨 설정 ({selectedAreas.length}개 대주제)
            </button>
          </div>
        </section>
      )}

      {/* 스텝3: 레벨 설정 */}
      {step === 3 && (
        <section className="space-y-3">
          <p className="text-sm text-neutral-500">
            대주제별로 학습 레벨을 선택하세요 (복수 가능). 선택한 레벨에 맞는
            소주제가 생성됩니다.
          </p>
          {selectedAreas.map((a) => {
            const i = areas.indexOf(a);
            return (
              <div
                key={a.name}
                className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800"
              >
                <div className="mb-2 text-sm font-medium">{a.name}</div>
                <div className="flex flex-wrap gap-2">
                  {LEVELS.map((lv) => (
                    <button
                      key={lv.n}
                      onClick={() => toggleLevel(i, lv.n)}
                      className={`rounded border px-3 py-1 text-xs ${
                        a.levels.includes(lv.n)
                          ? "border-blue-500 bg-blue-500/10 text-blue-500"
                          : "border-neutral-300 text-neutral-500 dark:border-neutral-700"
                      }`}
                      title={lv.desc}
                    >
                      {lv.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          <p className="rounded border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-amber-600 dark:text-amber-400">
            생성하면 현재 주제 트리가 새로 교체됩니다. (기존 진행 표시 ✅는
            사라집니다)
          </p>
          {busy && progress && (
            <div className="space-y-1">
              <div className="h-2 w-full overflow-hidden rounded bg-neutral-200 dark:bg-neutral-800">
                <div
                  className="h-full rounded bg-blue-500 transition-all duration-300"
                  style={{
                    width: `${(progress.done / progress.total) * 100}%`,
                  }}
                />
              </div>
              <p className="text-xs text-neutral-500">
                {progress.current} 생성 중… ({progress.done}/{progress.total}{" "}
                대주제)
              </p>
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => setStep(2)}
              disabled={busy}
              className="rounded border border-neutral-300 px-4 py-2 text-sm disabled:opacity-40 dark:border-neutral-700"
            >
              이전
            </button>
            <button
              onClick={generate}
              disabled={busy}
              className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-40"
            >
              {busy && progress
                ? `주제 생성 중… (${progress.done}/${progress.total})`
                : "주제 트리 생성"}
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
