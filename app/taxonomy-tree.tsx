"use client";

import { useEffect, useState } from "react";

interface Leaf {
  name: string;
  covered: boolean;
}
interface Mid {
  name: string;
  leaves: Leaf[];
}
interface Top {
  name: string;
  mids: Mid[];
}

/** 주제명에서 괄호 설명 제거한 짧은 표기 */
const short = (name: string) => name.split("(")[0].trim();

/**
 * 좌측 주제 트리: 대주제 > 중주제 > 소주제를 접을 수 있는 폴더 구조로.
 * 소주제 클릭 시 입력창에 주제를 넣어 바로 시작할 수 있게 한다.
 */
export function TaxonomyTree({
  onPick,
}: {
  onPick: (topic: string) => void;
}) {
  const [tree, setTree] = useState<Top[]>([]);
  const [open, setOpen] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/taxonomy")
      .then((r) => r.json())
      .then((d) => {
        const t: Top[] = d.tree ?? [];
        setTree(t);
        // 기본: 대주제는 펼치고 중주제는 접어둠
        setOpen(new Set(t.map((top) => top.name)));
      });
  }, []);

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  if (tree.length === 0) {
    return <p className="p-3 text-xs text-neutral-500">주제 로딩 중…</p>;
  }

  return (
    <div className="space-y-1 p-2 text-sm">
      {tree.map((top) => {
        const topOpen = open.has(top.name);
        return (
          <div key={top.name}>
            <button
              onClick={() => toggle(top.name)}
              className="flex w-full items-center gap-1 rounded px-2 py-1 text-left font-semibold hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              <span className="text-xs text-neutral-400">
                {topOpen ? "▾" : "▸"}
              </span>
              <span className="truncate">{short(top.name)}</span>
            </button>
            {topOpen &&
              top.mids.map((mid) => {
                const key = `${top.name}/${mid.name}`;
                const midOpen = open.has(key);
                const covered = mid.leaves.filter((l) => l.covered).length;
                return (
                  <div key={key} className="ml-3">
                    <button
                      onClick={() => toggle(key)}
                      className="flex w-full items-center gap-1 rounded px-2 py-1 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    >
                      <span className="text-xs text-neutral-400">
                        {midOpen ? "▾" : "▸"}
                      </span>
                      <span className="truncate text-neutral-700 dark:text-neutral-300">
                        {short(mid.name)}
                      </span>
                      <span className="ml-auto shrink-0 text-[10px] text-neutral-400">
                        {covered}/{mid.leaves.length}
                      </span>
                    </button>
                    {midOpen && (
                      <ul className="ml-4 border-l border-neutral-200 dark:border-neutral-800">
                        {mid.leaves.map((leaf) => (
                          <li key={leaf.name}>
                            <button
                              onClick={() => onPick(leaf.name)}
                              title="클릭하면 입력창에 주제가 들어갑니다"
                              className="flex w-full items-start gap-1.5 rounded px-2 py-0.5 text-left text-xs text-neutral-600 hover:bg-blue-500/10 hover:text-blue-500 dark:text-neutral-400"
                            >
                              <span className="mt-0.5 shrink-0">
                                {leaf.covered ? "✅" : "·"}
                              </span>
                              <span>{leaf.name}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
          </div>
        );
      })}
    </div>
  );
}
