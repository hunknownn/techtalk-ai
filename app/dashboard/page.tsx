import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { parseTaxonomy } from "@/lib/taxonomy";
import { getCurrentUser } from "@/lib/webauth";
import { ensureUserRuntime } from "@/lib/userenv";
import { RescanButton } from "./rescan-button";
import { SessionList } from "./session-list";
import { CoverageTree } from "./coverage-tree";

export const dynamic = "force-dynamic";

interface SessionRow {
  id: number;
  topic: string | null;
  mode: string;
  created_at: string;
}

interface ArtifactRow {
  id: number;
  title: string | null;
  kind: string;
  taxonomy_path: string | null;
  created_at: string;
}

interface RepeatRow {
  topic: string;
  cnt: number;
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const rt = ensureUserRuntime(user);
  const tree = parseTaxonomy(rt.home);
  const totalLeaves = tree.flatMap((t) => t.mids.flatMap((m) => m.leaves));
  const coveredCount = totalLeaves.filter((l) => l.covered).length;

  const recentSessions = db
    .prepare(
      "SELECT id, topic, mode, created_at FROM sessions WHERE deleted = 0 AND user_id = ? ORDER BY id DESC LIMIT 20"
    )
    .all(user.id) as SessionRow[];
  const recentArtifacts = db
    .prepare(
      "SELECT id, title, kind, taxonomy_path, created_at FROM artifacts WHERE user_id = ? ORDER BY id DESC LIMIT 10"
    )
    .all(user.id) as ArtifactRow[];
  const repeats = db
    .prepare(
      "SELECT topic, COUNT(*) as cnt FROM sessions WHERE topic IS NOT NULL AND user_id = ? GROUP BY topic HAVING cnt > 1 ORDER BY cnt DESC LIMIT 10"
    )
    .all(user.id) as RepeatRow[];

  // 다음 추천: 미커버 소주제 앞에서부터 (taxonomy가 학습 사다리 순서로 배열돼 있음)
  const recommendations = totalLeaves.filter((l) => !l.covered).slice(0, 6);

  return (
    <main className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">학습 대시보드</h1>
        <nav className="flex items-center gap-3 text-sm">
          <RescanButton />
          <Link href="/artifacts" className="text-blue-500 hover:underline">
            산출물
          </Link>
          <Link href="/" className="text-blue-500 hover:underline">
            채팅
          </Link>
        </nav>
      </div>

      {/* 전체 커버리지 */}
      <section className="mb-8 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="font-semibold">전체 커버리지</h2>
          <span className="text-sm text-neutral-500">
            {coveredCount} / {totalLeaves.length} 소주제 (
            {totalLeaves.length > 0
              ? Math.round((coveredCount / totalLeaves.length) * 100)
              : 0}
            %)
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded bg-neutral-200 dark:bg-neutral-800">
          <div
            className="h-full bg-blue-500"
            style={{
              width: `${totalLeaves.length > 0 ? (coveredCount / totalLeaves.length) * 100 : 0}%`,
            }}
          />
        </div>
      </section>

      {/* 영역별 커버리지 (폴더 구조, 소주제 클릭 → 채팅 시작) */}
      <section className="mb-8">
        <h2 className="mb-3 font-semibold">영역별 커버리지</h2>
        <CoverageTree />
      </section>

      {/* 다음 추천 */}
      <section className="mb-8">
        <h2 className="mb-3 font-semibold">다음 추천 주제</h2>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {recommendations.map((r) => (
            <li key={r.name}>
              <Link
                href={`/?topic=${encodeURIComponent(r.name)}`}
                title="클릭하면 이 주제로 채팅을 시작합니다"
                className="block rounded-lg border border-neutral-200 p-3 text-sm hover:border-blue-400 hover:bg-blue-500/5 dark:border-neutral-800"
              >
                {r.name}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* 최근 세션 (클릭 → 이어가기, ✕ → 삭제) */}
        <section>
          <h2 className="mb-3 font-semibold">최근 세션</h2>
          <SessionList sessions={recentSessions} />
        </section>

        {/* 반복 학습 */}
        <section>
          <h2 className="mb-3 font-semibold">반복 학습</h2>
          {repeats.length === 0 ? (
            <p className="text-sm text-neutral-500">
              같은 주제를 2회 이상 다룬 기록이 없습니다.
            </p>
          ) : (
            <ul className="space-y-1 text-sm">
              {repeats.map((r) => (
                <li key={r.topic} className="flex justify-between gap-2">
                  <span className="truncate">{r.topic}</span>
                  <span className="shrink-0 text-xs text-neutral-500">
                    {r.cnt}회
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* 최근 산출물 */}
      <section className="mt-8">
        <h2 className="mb-3 font-semibold">최근 산출물</h2>
        {recentArtifacts.length === 0 ? (
          <p className="text-sm text-neutral-500">
            아직 산출물이 없습니다. 우측 상단 &quot;재수집&quot;으로 기존 파일을
            가져올 수 있습니다.
          </p>
        ) : (
          <ul className="space-y-1 text-sm">
            {recentArtifacts.map((a) => (
              <li key={a.id} className="flex justify-between gap-2">
                <a
                  href={`/artifacts/${a.id}`}
                  target="_blank"
                  className="truncate text-blue-500 hover:underline"
                >
                  {a.kind === "html" ? "🌐" : "📝"} {a.title ?? `#${a.id}`}
                </a>
                <span className="shrink-0 text-xs text-neutral-500">
                  {a.taxonomy_path} · {a.created_at.slice(0, 10)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
