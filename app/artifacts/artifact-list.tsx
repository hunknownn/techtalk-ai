"use client";

import { useState } from "react";

export interface ArtifactRow {
  id: number;
  title: string | null;
  kind: string;
  taxonomy_path: string | null;
  created_at: string;
}

const KINDS = [
  { key: "all", label: "전체" },
  { key: "html", label: "인터랙티브 HTML" },
  { key: "note", label: "학습노트" },
];

/** 산출물 목록: 제목·주제 경로 즉시 검색 + 종류 필터 (클라이언트 필터링) */
export function ArtifactList({ rows }: { rows: ArtifactRow[] }) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("all");

  const query = q.trim().toLowerCase();
  const filtered = rows.filter((r) => {
    if (kind !== "all" && r.kind !== kind) return false;
    if (!query) return true;
    return (
      (r.title ?? "").toLowerCase().includes(query) ||
      (r.taxonomy_path ?? "").toLowerCase().includes(query)
    );
  });

  return (
    <>
      <div className="mb-4 flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="제목·주제 경로 검색"
          className="flex-1 rounded border border-neutral-300 bg-transparent p-2 text-sm outline-none focus:border-blue-500 dark:border-neutral-700"
        />
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className="rounded border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          aria-label="산출물 종류 필터"
        >
          {KINDS.map((k) => (
            <option key={k.key} value={k.key}>
              {k.label}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-neutral-500">
          {rows.length === 0
            ? "아직 산출물이 없습니다. 채팅에서 바로산출물 모드로 만들어보세요."
            : "검색 조건에 맞는 산출물이 없습니다."}
        </p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((r) => (
            <li
              key={r.id}
              className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800"
            >
              <a
                href={`/artifacts/${r.id}`}
                target="_blank"
                className="font-medium text-blue-500 hover:underline"
              >
                {r.title ?? `#${r.id}`}
              </a>
              <div className="mt-1 text-xs text-neutral-500">
                {r.kind === "html" ? "인터랙티브 HTML" : "학습노트"}
                {r.taxonomy_path ? ` · ${r.taxonomy_path}` : ""} ·{" "}
                {r.created_at}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
