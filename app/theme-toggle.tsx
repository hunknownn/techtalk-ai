"use client";

import { useSyncExternalStore } from "react";

const THEME_EVENT = "techtalk-theme";

function subscribe(cb: () => void) {
  window.addEventListener(THEME_EVENT, cb);
  return () => window.removeEventListener(THEME_EVENT, cb);
}

/**
 * 다크모드 토글. 실제 상태는 <html>의 .dark 클래스가 원본이며
 * (layout의 인라인 스크립트가 저장값/시스템 설정으로 초기화),
 * 선택은 localStorage("theme")에 저장된다.
 */
export function ThemeToggle() {
  const dark = useSyncExternalStore(
    subscribe,
    () => document.documentElement.classList.contains("dark"),
    () => false // 서버 렌더 기본값 — 하이드레이션 후 실제 값으로 갱신됨
  );

  const toggle = () => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
    window.dispatchEvent(new Event(THEME_EVENT));
  };

  return (
    <button
      onClick={toggle}
      title={dark ? "라이트 모드로 전환" : "다크 모드로 전환"}
      aria-label="테마 전환"
      className="rounded p-1.5 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-800 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
    >
      {dark ? (
        // 해 아이콘 (라이트로 전환)
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        // 달 아이콘 (다크로 전환)
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
        </svg>
      )}
    </button>
  );
}
