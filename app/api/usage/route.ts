import { getCurrentUser } from "@/lib/webauth";
import { readStoredUsage } from "@/lib/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    return Response.json(readStoredUsage(user.id));
  } catch {
    return Response.json({ stale: true, fiveHour: null, sevenDay: null });
  }
}
