"use client";

import { useCallback, useEffect, useState } from "react";

interface AuthStatus {
  credentials: { exists: boolean; expiresAt: string | null };
  longLivedToken: { exists: boolean; createdAt: string | null };
  reauth: {
    phase: "idle" | "starting" | "waiting_code" | "exchanging" | "done" | "error";
    url: string | null;
    message: string | null;
  };
}

export default function AuthPage() {
  const [adminCode, setAdminCode] = useState("");
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [authCode, setAuthCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("techtalk-admin-code") ?? "";
    setAdminCode(saved);
    // 저장된 관리 코드가 있으면 접속 즉시 상태 표시 (진행 중 재인증 URL 포함)
    if (saved) {
      fetch("/api/auth/status", { headers: { "x-admin-code": saved } })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setStatus(d))
        .catch(() => {});
    }
  }, []);

  const headers = useCallback(
    (): HeadersInit => ({
      "Content-Type": "application/json",
      "x-admin-code": adminCode,
    }),
    [adminCode]
  );

  const refresh = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/auth/status", { headers: headers() });
    if (res.status === 401) {
      setStatus(null);
      setError("관리 코드가 올바르지 않습니다.");
      return;
    }
    setStatus(await res.json());
  }, [headers]);

  // 재인증 진행 중엔 상태 폴링
  useEffect(() => {
    const phase = status?.reauth.phase;
    if (phase === "starting" || phase === "exchanging") {
      const t = setTimeout(refresh, 1500);
      return () => clearTimeout(t);
    }
  }, [status, refresh]);

  async function act(action: "start" | "code") {
    setError(null);
    localStorage.setItem("techtalk-admin-code", adminCode);
    const res = await fetch("/api/auth/reauth", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ action, code: authCode }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? `실패 (${res.status})`);
    } else {
      setAuthCode("");
    }
    await refresh();
  }

  const phase = status?.reauth.phase ?? "idle";

  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">인증 관리</h1>
        <a href="/" className="text-sm text-blue-500 hover:underline">
          ← 채팅으로
        </a>
      </div>

      {/* 관리 코드 */}
      <section className="mb-6 flex items-end gap-2">
        <label className="flex-1 text-sm">
          <span className="mb-1 block text-neutral-500">관리 코드</span>
          <input
            type="password"
            value={adminCode}
            onChange={(e) => setAdminCode(e.target.value)}
            className="w-full rounded border border-neutral-300 bg-transparent p-2 dark:border-neutral-700"
            placeholder="TECHTALK_ADMIN_CODE"
          />
        </label>
        <button
          onClick={refresh}
          className="rounded bg-blue-600 px-4 py-2 text-sm text-white"
        >
          상태 조회
        </button>
      </section>

      {error && (
        <p className="mb-4 rounded border border-red-500/40 bg-red-500/5 p-3 text-sm text-red-500">
          {error}
        </p>
      )}

      {status && (
        <>
          {/* 현재 인증 상태 */}
          <section className="mb-6 space-y-2 rounded-lg border border-neutral-200 p-4 text-sm dark:border-neutral-800">
            <h2 className="font-semibold">현재 인증</h2>
            <p>
              기본 인증(.credentials.json):{" "}
              {status.credentials.exists ? (
                <>
                  있음
                  {status.credentials.expiresAt && (
                    <span className="text-neutral-500">
                      {" "}
                      · 액세스 토큰 만료{" "}
                      {new Date(status.credentials.expiresAt).toLocaleString()}
                      (자동 갱신됨)
                    </span>
                  )}
                </>
              ) : (
                <span className="text-red-500">없음</span>
              )}
            </p>
            <p>
              장기 토큰(setup-token):{" "}
              {status.longLivedToken.exists ? (
                <>
                  있음
                  <span className="text-neutral-500">
                    {" "}
                    · 발급{" "}
                    {status.longLivedToken.createdAt
                      ? new Date(
                          status.longLivedToken.createdAt
                        ).toLocaleString()
                      : "?"}
                  </span>
                </>
              ) : (
                "없음"
              )}
            </p>
          </section>

          {/* 재인증 플로우 */}
          <section className="space-y-3 rounded-lg border border-neutral-200 p-4 text-sm dark:border-neutral-800">
            <h2 className="font-semibold">재인증 (장기 토큰 재발급)</h2>

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
                  재인증 시작
                </button>
              </>
            ) : phase === "waiting_code" && status.reauth.url ? (
              <>
                <p>
                  1. 아래 링크를 열어 Claude 계정으로 로그인하고 코드를
                  복사하세요.
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
