import fs from "node:fs";
import path from "node:path";
import {
  buildAuthorizeUrl,
  createPkce,
  exchangeCode,
  fetchProfile,
  writeCredentials,
} from "./oauth";

/**
 * 구독 연결(OAuth) 진행 상태.
 *
 * 예전엔 pty로 `claude setup-token`을 몰아야 해서 detached 드라이버 프로세스와
 * 파일 IPC가 필요했다. 이제 OAuth를 직접 수행하므로 별도 프로세스가 없다.
 * 다만 인증 URL 생성(요청 A)과 코드 제출(요청 B)이 서로 다른 Next.js 인스턴스일
 * 수 있어, PKCE verifier는 여전히 파일(PVC)로 주고받는다.
 */

type Phase =
  | "idle"
  | "starting"
  | "waiting_code"
  | "exchanging"
  | "done"
  | "error";

export interface ReauthState {
  phase: Phase;
  url: string | null;
  message: string | null;
}

const DATA_DIR =
  process.env.TECHTALK_DATA_DIR ?? path.join(process.cwd(), "data");

function workdir(userId: number): string {
  return path.join(DATA_DIR, "reauth", String(userId));
}

function readFileSafe(p: string): string | null {
  try {
    return fs.readFileSync(p, "utf8").trim();
  } catch {
    return null;
  }
}

function setPhase(userId: number, phase: Phase, message?: string): void {
  fs.writeFileSync(
    path.join(workdir(userId), "phase.txt"),
    JSON.stringify({ phase, message: message ?? null })
  );
}

/** 인증 URL 생성. PKCE verifier를 저장해두고 코드 제출 때 다시 쓴다. */
export function startReauth(userId: number): void {
  const wd = workdir(userId);
  fs.mkdirSync(wd, { recursive: true });
  // 이전 흔적 정리 후 시작
  for (const f of ["url.txt", "pkce.json", "phase.txt"]) {
    try {
      fs.unlinkSync(path.join(wd, f));
    } catch {
      /* 없으면 무시 */
    }
  }

  const { verifier, challenge, state } = createPkce();
  fs.writeFileSync(
    path.join(wd, "pkce.json"),
    JSON.stringify({ verifier, state }),
    { mode: 0o600 }
  );
  fs.writeFileSync(path.join(wd, "url.txt"), buildAuthorizeUrl(challenge, state));
  setPhase(userId, "waiting_code");
}

export function readReauthState(userId: number): ReauthState {
  const wd = workdir(userId);
  let phase: Phase = "idle";
  let message: string | null = null;
  const phaseRaw = readFileSafe(path.join(wd, "phase.txt"));
  if (phaseRaw) {
    try {
      const parsed = JSON.parse(phaseRaw) as { phase: Phase; message: string };
      phase = parsed.phase;
      message = parsed.message ?? null;
    } catch {
      /* 손상 시 idle */
    }
  }
  const url = readFileSafe(path.join(wd, "url.txt"));
  return { phase, url: phase === "waiting_code" ? url : null, message };
}

/** 사용자가 붙여넣은 코드를 토큰으로 교환하고 자격증명 파일에 기록한다. */
export async function submitReauthCode(
  userId: number,
  code: string,
  home: string
): Promise<void> {
  const state = readReauthState(userId);
  if (state.phase !== "waiting_code") {
    throw new Error("코드를 받을 단계가 아닙니다. 연결을 먼저 시작하세요.");
  }
  const pkceRaw = readFileSafe(path.join(workdir(userId), "pkce.json"));
  if (!pkceRaw) {
    setPhase(userId, "error", "인증 정보가 만료됐습니다. 다시 시작하세요.");
    throw new Error("인증 정보가 만료됐습니다. 다시 시작하세요.");
  }
  const pkce = JSON.parse(pkceRaw) as { verifier: string; state: string };

  setPhase(userId, "exchanging");
  try {
    const tok = await exchangeCode(code, pkce.verifier, pkce.state);
    const profile = await fetchProfile(tok.access_token);
    writeCredentials(home, tok, profile);
    // verifier는 1회용 — 교환 후 즉시 폐기
    try {
      fs.unlinkSync(path.join(workdir(userId), "pkce.json"));
    } catch {
      /* 이미 없음 */
    }
    setPhase(userId, "done", "구독 연결 완료");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    setPhase(userId, "error", msg);
    throw e;
  }
}
