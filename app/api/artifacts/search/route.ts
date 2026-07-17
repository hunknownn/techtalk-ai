import { NextRequest } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Row {
  id: number;
  title: string | null;
  slug: string | null;
  kind: string;
  taxonomy_path: string | null;
  created_at: string;
}

// 주제 문자열과 관련된 산출물 검색 (토큰 매칭 스코어링)
// 예: "인덱스 내부 구조 (B-Tree vs LSM-Tree)" ↔ "btree-vs-lsm-techtalk.html"
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const tokens = (q.toLowerCase().match(/[가-힣a-z0-9+]{2,}/g) ?? []).filter(
    (t) => !["vs", "및", "그리고", "대해", "관련"].includes(t)
  );
  if (tokens.length === 0) return Response.json({ artifacts: [] });

  const rows = db
    .prepare(
      "SELECT id, title, slug, kind, taxonomy_path, created_at FROM artifacts ORDER BY id DESC LIMIT 300"
    )
    .all() as Row[];

  const scored = rows
    .map((r) => {
      const hay =
        `${r.title ?? ""} ${r.slug ?? ""} ${r.taxonomy_path ?? ""}`.toLowerCase();
      const score = tokens.filter((t) => hay.includes(t)).length;
      return { ...r, score };
    })
    .filter((r) => r.score >= Math.min(2, tokens.length))
    .sort((a, b) => b.score - a.score || b.id - a.id)
    .slice(0, 8);

  return Response.json({ artifacts: scored });
}
