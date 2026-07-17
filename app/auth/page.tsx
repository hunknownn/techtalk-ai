"use client";

import { useCallback, useEffect, useState } from "react";

interface AuthStatus {
  username: string;
  token: { exists: boolean; createdAt: string | null };
  reauth: {
    phase: "idle" | "starting" | "waiting_code" | "exchanging" | "done" | "error";
    url: string | null;
    message: string | null;
  };
}

export default function AuthPage() {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [authCode, setAuthCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/auth/status");
    if (res.status === 401) {
      window.location.href = "/login";
      return;
    }
    setStatus(await res.json());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // 연결 진행 중엔 상태 폴링
  useEffect(() => {
    const phase = status?.reauth.phase;
    if (phase === "starting" || phase === "exchanging") {
      const t = setTimeout(refresh, 1500);
      return () => clearTimeout(t);
    }
  }, [status, refresh]);

  async function act(action: "start" | "code") {
    setError(null);
    const res = await fetch("/api/auth/reauth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, code: authCode }),
    });
    const data = await res.json();
    if (!res.ok) setError(data.error ?? `실패 (${res.status})`);
    else setAuthCode("");
    await refresh();
  }

  const phase = status?.reauth.phase ?? "idle";

  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">구독 연결</h1>
        <a href="/" className="text-sm text-blue-500 hover:underline">
          ← 채팅으로
        </a>
      </div>

      {status && (
        <>
          <section className="mb-6 space-y-2 rounded-lg border border-neutral-200 p-4 text-sm dark:border-neutral-800">
            <h2 className="font-semibold">
              {status.username} 님의 구독 상태
            </h2>
            {status.token.exists ? (
              <p className="text-emerald-500">
                연결됨
                {status.token.createdAt && (
                  <span className="text-neutral-500">
                    {" "}
                    · {new Date(status.token.createdAt).toLocaleString()} 발급
                    (만료 전까지 유지)
                  </span>
                )}
              </p>
            ) : (
              <p className="text-amber-500">
                미연결 — 아래에서 본인 Claude 구독을 연결해야 대화할 수
                있습니다.
              </p>
            )}
          </section>

          <section className="space-y-3 rounded-lg border border-neutral-200 p-4 text-sm dark:border-neutral-800">
            <h2 className="font-semibold">
              {status.token.exists ? "재연결 (토큰 재발급)" : "구독 연결"}
            </h2>

            {error && <p className="text-red-500">{error}</p>}

            {phase === "idle" || phase === "done" || phase === "error" ? (
              <>
                {status.reauth.message && (
                  <p
                    className={
                      phase === "error" ? "text-red-500" : "text-emerald-500"
                    }
                  >
                    {status.reauth.message}
                  </p>
                )}
                <button
                  onClick={() => act("start")}
                  className="rounded bg-blue-600 px-4 py-2 text-white"
                >
                  {status.token.exists ? "재연결 시작" : "연결 시작"}
                </button>
              </>
            ) : phase === "waiting_code" && status.reauth.url ? (
              <>
                <p>
                  1. 아래 링크를 열어 <b>본인 Claude 계정</b>으로 로그인하고
                  코드를 복사하세요.
                </p>
                <a
                  href={status.reauth.url}
                  target="_blank"
                  className="block break-all rounded border border-blue-500/40 bg-blue-500/5 p-2 text-blue-500 hover:underline"
                >
                  {status.reauth.url}
                </a>
                <p>2. 받은 코드를 붙여넣고 제출:</p>
                <div className="flex gap-2">
                  <input
                    value={authCode}
                    onChange={(e) => setAuthCode(e.target.value)}
                    className="flex-1 rounded border border-neutral-300 bg-transparent p-2 dark:border-neutral-700"
                    placeholder="인증 코드"
                  />
                  <button
                    onClick={() => act("code")}
                    disabled={!authCode.trim()}
                    className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-40"
                  >
                    제출
                  </button>
                </div>
              </>
            ) : (
              <p className="text-neutral-500">
                {phase === "starting" ? "인증 URL 준비 중…" : "토큰 교환 중…"}
              </p>
            )}
          </section>
        </>
      )}
    </main>
  );
}
