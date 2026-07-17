"use client";

import { useState } from "react";
import { PasswordInput } from "../password-input";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? `실패 (${res.status})`);
      }
      window.location.href = "/";
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
        <h1 className="text-xl font-bold">techtalk</h1>
        <p className="text-sm text-neutral-500">
          로그인 후 본인 Claude 구독을 연결해 사용합니다.
        </p>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="아이디"
          autoComplete="username"
          className="w-full rounded border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700"
        />
        <PasswordInput
          value={password}
          onChange={setPassword}
          placeholder="비밀번호"
          autoComplete="current-password"
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={busy || !username || !password}
          className="w-full rounded bg-blue-600 p-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {busy ? "로그인 중…" : "로그인"}
        </button>
        <p className="text-center text-xs text-neutral-500">
          계정이 없나요?{" "}
          <a href="/signup" className="text-blue-500 hover:underline">
            가입하기
          </a>{" "}
          (가입 코드 필요)
        </p>
      </form>
    </main>
  );
}
