"use client";

import { useEffect, useState } from "react";
import { PasswordInput } from "../password-input";

export default function SignupPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [invite, setInvite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [nameCheck, setNameCheck] = useState<{
    ok: boolean;
    reason?: string;
  } | null>(null);

  // 아이디 실시간 중복·형식 검사 (디바운스)
  useEffect(() => {
    if (!username) return setNameCheck(null);
    const t = setTimeout(() => {
      fetch(`/api/users/check?username=${encodeURIComponent(username)}`)
        .then((r) => r.json())
        .then(setNameCheck)
        .catch(() => {});
    }, 350);
    return () => clearTimeout(t);
  }, [username]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-signup-code": invite,
        },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `실패 (${res.status})`);

      // 가입 즉시 자동 로그인
      const login = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!login.ok) throw new Error("가입은 됐지만 로그인 실패 — 로그인 페이지에서 시도하세요");
      window.location.href = "/auth"; // 다음 단계: 구독 연결
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <main className="flex h-dvh items-center justify-center p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-4 rounded-xl border border-neutral-200 p-6 dark:border-neutral-800"
      >
        <h1 className="text-xl font-bold">techtalk 가입</h1>
        <p className="text-sm text-neutral-500">
          가입 후 본인 Claude 구독을 연결해 사용합니다. 사용량은 각자 자기
          구독에서 소모됩니다.
        </p>
        <div>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
            placeholder="아이디 (소문자/숫자 2-20자)"
            autoComplete="username"
            className="w-full rounded border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700"
          />
          {nameCheck && (
            <p
              className={`mt-1 text-xs ${nameCheck.ok ? "text-emerald-500" : "text-red-500"}`}
            >
              {nameCheck.ok ? "사용 가능한 아이디" : nameCheck.reason}
            </p>
          )}
        </div>
        <PasswordInput
          value={password}
          onChange={setPassword}
          placeholder="비밀번호 (8자 이상)"
          autoComplete="new-password"
        />
        <input
          type="text"
          value={invite}
          onChange={(e) => setInvite(e.target.value)}
          placeholder="가입 코드 (운영자에게 받으세요)"
          className="w-full rounded border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700"
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={
            busy ||
            !password ||
            !invite ||
            !nameCheck?.ok ||
            password.length < 8
          }
          className="w-full rounded bg-blue-600 p-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {busy ? "가입 중…" : "가입하기"}
        </button>
        <p className="text-center text-xs text-neutral-500">
          이미 계정이 있나요?{" "}
          <a href="/login" className="text-blue-500 hover:underline">
            로그인
          </a>
        </p>
      </form>
    </main>
  );
}
