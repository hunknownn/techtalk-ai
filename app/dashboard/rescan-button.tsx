"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** ~/techtalk 전체를 재스캔해 DB로 수집 (수동 임포트용) */
export function RescanButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function rescan() {
    setBusy(true);
    try {
      const res = await fetch("/api/ingest", { method: "POST" });
      const data = await res.json();
      alert(`수집 완료: ${data.count}건`);
      router.refresh();
    } catch {
      alert("수집 실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={rescan}
      disabled={busy}
      className="rounded border border-neutral-300 px-2 py-1 text-xs hover:border-blue-400 disabled:opacity-50 dark:border-neutral-700"
    >
      {busy ? "수집 중…" : "재수집"}
    </button>
  );
}
