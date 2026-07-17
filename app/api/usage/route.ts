import { fetchUsageHud } from "@/lib/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await fetchUsageHud());
  } catch {
    return Response.json({ stale: true, fiveHour: null, sevenDay: null });
  }
}
