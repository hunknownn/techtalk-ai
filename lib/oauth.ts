import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * Claude 구독 OAuth (Authorization Code + PKCE).
 *
 * 예전엔 `claude setup-token`을 pty로 몰아 터미널 출력에서 토큰을 긁어냈다.
 * 그런데 그 경로는 `inferenceOnly`로 교환돼 `user:inference` 스코프만 받는다.
 * 사용량 조회(/api/oauth/usage)는 `user:profile`을 요구하므로 항상 403이 났다.
 *
 * 여기서는 CLI의 `/login`이 쓰는 것과 동일한 파라미터로 OAuth를 직접 수행해
 * `user:profile`까지 포함된 토큰을 받는다. TUI를 흉내낼 필요가 없어 pty 의존도
 * 사라진다.
 */

const CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const AUTHORIZE_URL = "https://claude.ai/oauth/authorize";
const TOKEN_URL = "https://platform.claude.com/v1/oauth/token";
// 로컬 콜백 서버를 띄울 수 없는 환경이므로 수동 리다이렉트 방식을 쓴다
// (사용자가 승인 후 화면의 코드를 복사해 붙여넣는다)
const REDIRECT_URI = "https://platform.claude.com/oauth/code/callback";
const PROFILE_URL = "https://api.anthropic.com/api/oauth/profile";

// CLI가 요청하는 스코프 그대로. user:profile 이 있어야 사용량 조회가 열린다.
const SCOPES = [
  "org:create_api_key",
  "user:profile",
  "user:inference",
  "user:sessions:claude_code",
  "user:mcp_servers",
];

export type SubscriptionType = "max" | "pro" | "enterprise" | "team" | null;

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
}

export interface ProfileInfo {
  subscriptionType: SubscriptionType;
  rateLimitTier: string | null;
}

function b64url(b: Buffer): string {
  return b
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

export function createPkce(): {
  verifier: string;
  challenge: string;
  state: string;
} {
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(
    crypto.createHash("sha256").update(verifier).digest()
  );
  const state = b64url(crypto.randomBytes(32));
  return { verifier, challenge, state };
}

export function buildAuthorizeUrl(challenge: string, state: string): string {
  const u = new URL(AUTHORIZE_URL);
  u.searchParams.append("code", "true");
  u.searchParams.append("client_id", CLIENT_ID);
  u.searchParams.append("response_type", "code");
  u.searchParams.append("redirect_uri", REDIRECT_URI);
  u.searchParams.append("scope", SCOPES.join(" "));
  u.searchParams.append("code_challenge", challenge);
  u.searchParams.append("code_challenge_method", "S256");
  u.searchParams.append("state", state);
  return u.toString();
}

/** 인증 코드 → 토큰 교환. 수동 플로우는 "<code>#<state>" 형태로 코드를 준다. */
export async function exchangeCode(
  rawCode: string,
  verifier: string,
  fallbackState: string
): Promise<TokenResponse> {
  const [code, stateFromCode] = rawCode.trim().split("#");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      code_verifier: verifier,
      state: stateFromCode || fallbackState,
    }),
  });
  if (!res.ok) {
    throw new Error(
      res.status === 401
        ? "인증 코드가 유효하지 않습니다. 다시 시도하세요."
        : `토큰 교환 실패 (${res.status})`
    );
  }
  return (await res.json()) as TokenResponse;
}

/** 요금제 정보 조회 — CLI와 동일하게 organization_type을 구독 종류로 매핑 */
export async function fetchProfile(accessToken: string): Promise<ProfileInfo> {
  const res = await fetch(PROFILE_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) throw new Error(`프로필 조회 실패 (${res.status})`);
  const data = (await res.json()) as {
    organization?: { organization_type?: string; rate_limit_tier?: string };
  };
  const orgType = data.organization?.organization_type;
  const subscriptionType: SubscriptionType =
    orgType === "claude_max"
      ? "max"
      : orgType === "claude_pro"
        ? "pro"
        : orgType === "claude_enterprise"
          ? "enterprise"
          : orgType === "claude_team"
            ? "team"
            : null;
  return {
    subscriptionType,
    rateLimitTier: data.organization?.rate_limit_tier ?? null,
  };
}

export function credentialsPath(home: string): string {
  return path.join(home, ".claude", ".credentials.json");
}

/**
 * CLI가 읽는 자격증명 파일 기록.
 *
 * 주의: 토큰을 CLAUDE_CODE_OAUTH_TOKEN 환경변수로 넘기면 CLI가 스코프를 확인조차
 * 하지 않고 subscriptionType을 null로 하드코딩해버린다. 반드시 이 파일 경로로
 * 넘겨야 실제 구독 정보가 인식된다.
 *
 * 액세스 토큰은 8시간이면 만료되지만, refreshToken이 함께 저장돼 있으면 CLI가
 * 알아서 갱신하고 이 파일을 되쓴다. ($HOME이 PVC라 갱신 결과도 영속된다)
 */
export function writeCredentials(
  home: string,
  tok: TokenResponse,
  profile: ProfileInfo
): void {
  const p = credentialsPath(home);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(
    p,
    JSON.stringify({
      claudeAiOauth: {
        accessToken: tok.access_token,
        refreshToken: tok.refresh_token,
        expiresAt: Date.now() + tok.expires_in * 1000,
        scopes: (tok.scope ?? "").split(" ").filter(Boolean),
        subscriptionType: profile.subscriptionType,
        rateLimitTier: profile.rateLimitTier,
      },
    }),
    { mode: 0o600 }
  );
}

export interface CredentialsMeta {
  subscriptionType: SubscriptionType;
  /** 이 파일이 마지막으로 기록된 시각 (최초 연결 또는 CLI의 토큰 갱신) */
  updatedAt: string | null;
}

/** 연결 여부·요금제 확인용. 토큰 값 자체는 노출하지 않는다. */
export function readCredentialsMeta(home: string): CredentialsMeta | null {
  const p = credentialsPath(home);
  try {
    const parsed = JSON.parse(fs.readFileSync(p, "utf-8")) as {
      claudeAiOauth?: { accessToken?: string; subscriptionType?: SubscriptionType };
    };
    if (!parsed.claudeAiOauth?.accessToken) return null;
    return {
      subscriptionType: parsed.claudeAiOauth.subscriptionType ?? null,
      updatedAt: fs.statSync(p).mtime.toISOString(),
    };
  } catch {
    return null;
  }
}
