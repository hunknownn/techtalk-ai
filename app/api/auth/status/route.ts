import fs from "node:fs";
import { isAdminAuthorized } from "@/lib/admin-guard";
import {
  reauthSession,
  readCredentialsExpiry,
  TOKEN_FILE,
} from "@/lib/reauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isAdminAuthorized(req)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const credentials = readCredentialsExpiry();
  let longLivedToken: { exists: boolean; createdAt: string | null } = {
    exists: false,
    createdAt: null,
  };
  try {
    const parsed = JSON.parse(fs.readFileSync(TOKEN_FILE, "utf-8"));
    longLivedToken = { exists: true, createdAt: parsed.createdAt ?? null };
  } catch {
    /* 토큰 파일 없음 */
  }
  return Response.json({
    credentials,
    longLivedToken,
    reauth: reauthSession.state,
  });
}
