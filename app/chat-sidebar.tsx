"use client";

import { useState } from "react";
import { TaxonomyTree } from "./taxonomy-tree";

export interface SessionSummary {
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

/**
 * 좌측 사이드바: 주제 트리 / 세션 목록 탭.
 * 세션은 클릭으로 이어가기, ✕로 삭제 (헤더 select 드롭다운 대체).
 */
export function ChatSidebar({
  selectedTopic,
  onPickTopic,
  sessions,
  currentSessionId,
  onSelectSession,
  onDeleteSession,
}: {
  selectedTopic: string | null;
  onPickTopic: (topic: string) => void;
  sessions: SessionSummary[];
  currentSessionId: number | null;
  onSelectSession: (id: number) => void;
  onDeleteSession: (id: number) => void;
}) {
  const [tab, setTab] = useState<"topics" | "sessions">("topics");

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 border-b border-neutral-200 text-sm dark:border-neutral-800">
        {(
          [
            { key: "topics", label: "주제" },
            { key: "sessions", label: `세션 (${sessions.length})` },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 px-3 py-2 ${
              tab === t.key
                ? "border-b-2 border-blue-500 font-medium text-blue-500"
                : "text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="slim-scroll min-h-0 flex-1 overflow-y-auto">
        {tab === "topics" ? (
          <TaxonomyTree selected={selectedTopic} onPick={onPickTopic} />
        ) : sessions.length === 0 ? (
          <p className="p-3 text-xs text-neutral-500">아직 세션이 없습니다.</p>
        ) : (
          <ul className="space-y-0.5 p-2 text-sm">
            {sessions.map((s) => (
              <li key={s.id}>
                <div
                  onClick={() => onSelectSession(s.id)}
                  className={`group flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 ${
                    s.id === currentSessionId
                      ? "bg-blue-500/15"
                      : "hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  }`}
                  title="클릭하면 이 세션을 이어갑니다"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">
                      {s.topic ?? `세션 #${s.id}`}
                    </span>
                    <span className="block text-[10px] text-neutral-500">
                      {MODE_LABEL[s.mode] ?? s.mode} ·{" "}
                      {s.created_at.slice(0, 10)}
                    </span>
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteSession(s.id);
                    }}
                    className="invisible shrink-0 text-xs text-red-400 hover:text-red-500 group-hover:visible"
                    title="세션 삭제"
                    aria-label={`세션 삭제: ${s.topic ?? `#${s.id}`}`}
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
