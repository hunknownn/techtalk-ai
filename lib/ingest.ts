import fs from "node:fs";
import path from "node:path";
import { db, OUTPUT_DIR } from "./db";

export interface IngestedArtifact {
  id: number;
  title: string;
  kind: "html" | "note";
}

export interface IngestScope {
  /** 스캔할 산출물 디렉토리 (사용자별 ~/techtalk) */
  outputDir?: string;
  /** 산출물 소유자 */
  userId?: number | null;
}

/**
 * techtalk 스킬이 outputDir에 쓴 산출물 중 sinceMs 이후 수정된
 * html/노트 파일을 DB로 수집한다. 스킬 동작(파일 쓰기)을 바꾸지 않고
 * 웹에서 서빙하기 위한 브리지.
 */
export function ingestNewArtifacts(
  sessionId: number | null,
  sinceMs: number,
  scope: IngestScope = {}
): IngestedArtifact[] {
  const outputDir = scope.outputDir ?? OUTPUT_DIR;
  const userId = scope.userId ?? null;
  if (!fs.existsSync(outputDir)) return [];
  const found: IngestedArtifact[] = [];

  const upsert = db.prepare(`
    INSERT INTO artifacts (session_id, title, slug, kind, content, taxonomy_path, source_path, user_id)
    VALUES (@sessionId, @title, @slug, @kind, @content, @taxonomyPath, @sourcePath, @userId)
    ON CONFLICT(source_path) DO UPDATE SET
      content = excluded.content,
      title = excluded.title,
      session_id = excluded.session_id,
      user_id = excluded.user_id
  `);
  const selectId = db.prepare("SELECT id FROM artifacts WHERE source_path = ?");

  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.isFile() || fs.statSync(full).mtimeMs < sinceMs) continue;
      // 색인 파일은 산출물이 아니므로 제외
      if (full === path.join(outputDir, "index.md")) continue;

      const kind = entry.name.endsWith(".html")
        ? ("html" as const)
        : entry.name.endsWith(".md")
          ? ("note" as const)
          : null;
      if (!kind) continue;

      const content = fs.readFileSync(full, "utf-8");
      const title =
        kind === "html"
          ? (content.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim() ?? entry.name)
          : entry.name.replace(/\.md$/, "");

      upsert.run({
        sessionId,
        title,
        slug: entry.name,
        kind,
        content,
        taxonomyPath: path.relative(outputDir, dir),
        sourcePath: full,
        userId,
      });
      const row = selectId.get(full) as { id: number };
      found.push({ id: row.id, title, kind });
    }
  };

  walk(outputDir);
  return found;
}
