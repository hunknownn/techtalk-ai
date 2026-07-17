"use client";

import { useRouter } from "next/navigation";
import { TaxonomyTree } from "../taxonomy-tree";

/** 영역별 커버리지를 접을 수 있는 폴더 구조로. 소주제 클릭 → 그 주제로 채팅 시작 */
export function CoverageTree() {
  const router = useRouter();
  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-800">
      <TaxonomyTree
        onPick={(topic) => router.push(`/?topic=${encodeURIComponent(topic)}`)}
      />
    </div>
  );
}
