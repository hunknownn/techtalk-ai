import fs from "node:fs";
import path from "node:path";
import type { WebUser } from "./webauth";
import { credentialsPath, readCredentialsMeta } from "./oauth";

/**
 * 사용자별 실행 환경 격리.
 * - home: Claude Code가 쓸 $HOME (스킬·taxonomy·SDK 세션이 여기 삶)
 * - outputDir: 스킬 산출물 폴더 (~/techtalk 상당)
 * - configDir: CLI 설정·자격증명 디렉토리 ($HOME/.claude)
 *
 * 구독 토큰은 configDir 안의 .credentials.json에 있고, CLI가 만료 시 직접
 * 갱신하며 되쓴다. $HOME이 PVC라 갱신 결과도 재시작 후까지 유지된다.
 */

export interface UserRuntime {
  home: string;
  outputDir: string;
  configDir: string;
}

function skillsSource(): string | null {
  const candidates = ["/opt/skills", path.join(process.cwd(), "skills")];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

export function ensureUserRuntime(user: WebUser): UserRuntime {
  const home = user.home_dir;
  const outputDir = path.join(home, "techtalk");
  const skillsDest = path.join(home, ".claude", "skills");

  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(skillsDest, { recursive: true });

  // 스킬 동기화 — 단 taxonomy.md는 사용자가 키우는 상태 파일이라 보존
  const src = skillsSource();
  if (src) {
    const liveTaxonomy = path.join(skillsDest, "techtalk", "taxonomy.md");
    const keep = fs.existsSync(liveTaxonomy)
      ? fs.readFileSync(liveTaxonomy)
      : null;
    fs.cpSync(src, skillsDest, { recursive: true, force: true });
    if (keep) fs.writeFileSync(liveTaxonomy, keep);
  }

  // 신규 홈이면 온보딩·trust를 건너뛰는 최소 설정 시드
  const configPath = path.join(home, ".claude.json");
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        hasCompletedOnboarding: true,
        projects: {
          [outputDir]: { hasTrustDialogAccepted: true },
          [home]: { hasTrustDialogAccepted: true },
        },
      })
    );
  }

  return { home, outputDir, configDir: path.join(home, ".claude") };
}

/**
 * SDK 서브프로세스에 넘길 환경변수.
 *
 * CLAUDE_CODE_OAUTH_TOKEN은 절대 넣지 않는다 — 그 변수가 있으면 CLI가 토큰의
 * 실제 스코프를 무시하고 subscriptionType을 null로 하드코딩해, 사용량 조회가
 * 영구히 막힌다. 자격증명은 configDir의 .credentials.json으로만 전달한다.
 */
export function agentEnv(rt: UserRuntime): Record<string, string> {
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    HOME: rt.home,
    CLAUDE_CONFIG_DIR: rt.configDir,
  };
  // 상속받은 환경에 남아 있더라도 확실히 제거 (있으면 사용량 조회가 죽는다)
  delete env.CLAUDE_CODE_OAUTH_TOKEN;
  return env;
}

/** 구독 연결 여부 — 미연결이면 대화 불가 (폴백 없음) */
export function hasSubscription(rt: UserRuntime): boolean {
  return readCredentialsMeta(rt.home) !== null;
}

/** 연결 상태 상세 (요금제·마지막 갱신 시각) */
export function subscriptionInfo(rt: UserRuntime) {
  return readCredentialsMeta(rt.home);
}

/** 자격증명 파일 경로 (진단·정리용) */
export function userCredentialsPath(rt: UserRuntime): string {
  return credentialsPath(rt.home);
}
