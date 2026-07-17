import { clearedCookie, destroyCurrentSession } from "@/lib/webauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  await destroyCurrentSession();
  return Response.json(
    { ok: true },
    { headers: { "Set-Cookie": clearedCookie() } }
  );
}
