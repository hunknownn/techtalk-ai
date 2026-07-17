"use client";

import { useRouter } from "next/navigation";

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

  async function remove(e: React.MouseEvent, id: number) {
    e.stopPropagation();
    if (!confirm("이 세션을 목록에서 삭제할까요? (산출물은 유지됩니다)")) return;
    await fetch(`/api/sessions/${id}`, { method: "DELETE" });
    router.refresh();
  }

  if (sessions.length === 0) {
    return <p className="text-sm text-neutral-500">아직 세션이 없습니다.</p>;
  }

  return (
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
              onClick={(e) => remove(e, s.id)}
              className="invisible text-xs text-red-400 hover:text-red-500 group-hover:visible"
              title="세션 삭제"
            >
              ✕
            </button>
          </span>
        </li>
      ))}
    </ul>
  );
}
