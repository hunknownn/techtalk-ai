import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface TaxonomyLeaf {
  name: string;
  covered: boolean;
}

export interface TaxonomyMid {
  name: string;
  leaves: TaxonomyLeaf[];
}

export interface TaxonomyTop {
  name: string;
  mids: TaxonomyMid[];
}

/**
 * 스킬이 관리하는 live taxonomy.md를 우선 사용한다
 * (스킬은 산출 시 ✅ 마킹·새 소주제 추가로 이 파일을 키운다).
 * 없으면 저장소에 구운 시드 사본으로 폴백.
 */
function taxonomyPath(): string | null {
  const candidates = [
    path.join(os.homedir(), ".claude", "skills", "techtalk", "taxonomy.md"),
    path.join(process.cwd(), "skills", "techtalk", "taxonomy.md"),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

export function parseTaxonomy(): TaxonomyTop[] {
  const file = taxonomyPath();
  if (!file) return [];
  const tree: TaxonomyTop[] = [];

  for (const line of fs.readFileSync(file, "utf-8").split("\n")) {
    const top = line.match(/^##\s*대주제:\s*(.+)$/);
    if (top) {
      tree.push({ name: top[1].trim(), mids: [] });
      continue;
    }
    const mid = line.match(/^###\s*중주제:\s*(.+)$/);
    if (mid && tree.length > 0) {
      tree[tree.length - 1].mids.push({ name: mid[1].trim(), leaves: [] });
      continue;
    }
    const leaf = line.match(/^-\s*(✅|·)\s*(.+)$/);
    if (leaf && tree.length > 0) {
      const mids = tree[tree.length - 1].mids;
      if (mids.length > 0) {
        mids[mids.length - 1].leaves.push({
          name: leaf[2].trim(),
          covered: leaf[1] === "✅",
        });
      }
    }
  }
  return tree;
}
