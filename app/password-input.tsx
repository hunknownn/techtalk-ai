"use client";

import { useState } from "react";

// 눈 토글이 달린 비밀번호 입력 (로그인·가입 공용)
export function PasswordInput({
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="w-full rounded border border-neutral-300 bg-transparent p-2 pr-10 text-sm dark:border-neutral-700"
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        tabIndex={-1}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
        title={show ? "숨기기" : "보기"}
      >
        {show ? "🙈" : "👁"}
      </button>
    </div>
  );
}
