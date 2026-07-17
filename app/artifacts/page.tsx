import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/webauth";
import { ArtifactList, type ArtifactRow } from "./artifact-list";

export const dynamic = "force-dynamic";

export default async function ArtifactsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const rows = db
    .prepare(
      "SELECT id, title, kind, taxonomy_path, created_at FROM artifacts WHERE user_id = ? ORDER BY id DESC"
    )
    .all(user.id) as ArtifactRow[];

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-6 text-2xl font-bold">산출물</h1>
      <ArtifactList rows={rows} />
    </main>
  );
}
