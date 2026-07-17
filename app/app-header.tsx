"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./theme-toggle";

const TABS = [
  { href: "/dashboard", label: "대시보드" },
  { href: "/artifacts", label: "산출물" },
  { href: "/auth", label: "인증" },
];

/** 전역 상단 바: 모든 페이지 공통 (로그인·가입 페이지 제외) */
export function AppHeader() {
  const pathname = usePathname();
  if (pathname === "/login" || pathname === "/signup") return null;

  return (
    <header className="flex shrink-0 items-center gap-2 border-b border-neutral-200 px-4 py-2 dark:border-neutral-800">
      <Link
        href="/"
        className="text-xl font-bold tracking-tight hover:opacity-80"
        title="홈 (채팅)"
      >
        techtalk
      </Link>

      <nav className="ml-2 flex items-center gap-1 text-sm">
        {TABS.map((t) => {
          const active = pathname === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={`rounded px-2.5 py-1 ${
                active
                  ? "bg-neutral-200 font-medium text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100"
                  : "text-neutral-600 hover:bg-neutral-200 dark:text-neutral-300 dark:hover:bg-neutral-800"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle />
        <button
          onClick={async () => {
            await fetch("/api/logout", { method: "POST" });
            window.location.href = "/login";
          }}
          className="text-sm text-neutral-400 hover:underline"
          title="로그아웃"
        >
          로그아웃
        </button>
      </div>
    </header>
  );
}
