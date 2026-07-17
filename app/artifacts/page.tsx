import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/webauth";

export const dynamic = "force-dynamic";

interface ArtifactListRow {
  id: number;
  title: string | null;
  kind: string;
  taxonomy_path: string | null;
  created_at: string;
}

export default async function ArtifactsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const rows = db
    .prepare(
      "SELECT id, title, kind, taxonomy_path, created_at FROM artifacts WHERE user_id = ? ORDER BY id DESC"
    )
    .all(user.id) as ArtifactListRow[];

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-6 text-2xl font-bold">산출물</h1>
      {rows.length === 0 ? (
        <p className="text-neutral-500">
          아직 산출물이 없습니다. 채팅에서 바로산출물 모드로 만들어보세요.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
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
    </main>
  );
}
