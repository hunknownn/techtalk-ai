"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "../confirm-dialog";

interface SessionRow {
  id: number;
  topic: string | null;
  mode: string;
  created_at: string;
}

const MODE_LABEL: Record<string, string> = {
  produce: "바로산출물",
  socratic: "소크라테스",
  drill: "실무",
};

/** 세션 목록: 클릭 → 채팅으로 이동해 이어가기, ✕ → 소프트 삭제 */
export function SessionList({ sessions }: { sessions: SessionRow[] }) {
  const router = useRouter();
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);

  async function remove(id: number) {
    await fetch(`/api/sessions/${id}`, { method: "DELETE" });
    setPendingDelete(null);
    router.refresh();
  }

  if (sessions.length === 0) {
    return <p className="text-sm text-neutral-500">아직 세션이 없습니다.</p>;
  }

  return (
    <>
    <ul className="space-y-1 text-sm">
      {sessions.map((s) => (
        <li
          key={s.id}
          onClick={() => router.push(`/?session=${s.id}`)}
          className="group flex cursor-pointer items-center justify-between gap-2 rounded px-2 py-1 hover:bg-blue-500/10"
          title="클릭하면 채팅에서 이어갑니다"
        >
          <span className="truncate">{s.topic ?? `세션 #${s.id}`}</span>
          <span className="flex shrink-0 items-center gap-2">
            <span className="text-xs text-neutral-500">
              {MODE_LABEL[s.mode] ?? s.mode} · {s.created_at.slice(0, 10)}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setPendingDelete(s.id);
              }}
              className="invisible text-xs text-red-400 hover:text-red-500 group-hover:visible"
              title="세션 삭제"
            >
              ✕
            </button>
          </span>
        </li>
      ))}
    </ul>
      <ConfirmDialog
        open={pendingDelete !== null}
        title="세션을 삭제할까요?"
        description="목록에서만 사라지며 생성된 산출물은 유지됩니다."
        confirmLabel="삭제"
        danger
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete !== null) remove(pendingDelete);
        }}
      />
    </>
  );
}
