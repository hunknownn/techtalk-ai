import fs from "node:fs";
import path from "node:path";
import type { UserRuntime } from "./userenv";

export interface GenMid {
  mid: string;
  subs: string[];
}
export interface GenMajor {
  major: string;
  mids: GenMid[];
}

/** 생성된 구조를 taxonomy.md 형식으로 직렬화 (모든 소주제는 미커버 ·) */
export function buildTaxonomyMd(topics: GenMajor[]): string {
  const lines: string[] = [
    "# techtalk 주제 분류 체계 (Taxonomy)",
    "",
    "`대주제 > 중주제 > 소주제`. 온보딩으로 생성됨. 새 주제를 다룰 때마다 한 줄 추가해 트리를 키운다.",
    "",
    "표기: `✅` = index.md에 생성 이력 있음(이미 다룸), `·` = 미커버.",
    "",
    "---",
    "",
  ];
  for (const t of topics) {
    lines.push(`## 대주제: ${t.major}`, "");
    for (const m of t.mids) {
      lines.push(`### 중주제: ${m.mid}`);
      for (const s of m.subs) lines.push(`- · ${s}`);
      lines.push("");
    }
  }
  return lines.join("\n");
}

export function taxonomyFilePath(rt: UserRuntime): string {
  return path.join(rt.home, ".claude", "skills", "techtalk", "taxonomy.md");
}

export function writeTaxonomy(rt: UserRuntime, topics: GenMajor[]): void {
  const file = taxonomyFilePath(rt);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buildTaxonomyMd(topics));
}
