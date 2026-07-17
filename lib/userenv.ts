import fs from "node:fs";
import path from "node:path";
import type { WebUser } from "./webauth";

/**
 * 사용자별 실행 환경 격리.
 * - home: Claude Code가 쓸 $HOME (스킬·taxonomy·SDK 세션이 여기 삶)
 * - outputDir: 스킬 산출물 폴더 (~/techtalk 상당)
 * - tokenFile: 본인 구독 장기 토큰 저장 위치 (/data = PVC, 재시작에도 유지)
 */

const DATA_DIR =
  process.env.TECHTALK_DATA_DIR ?? path.join(process.cwd(), "data");

export interface UserRuntime {
  home: string;
  outputDir: string;
  tokenFile: string;
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

  return {
    home,
    outputDir,
    tokenFile: path.join(DATA_DIR, `oauth-user-${user.id}.json`),
  };
}

/** 본인 구독 장기 토큰 읽기 — 없으면 null (폴백 없음: 대화 불가 처리) */
export function readUserToken(rt: UserRuntime): string | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(rt.tokenFile, "utf-8"));
    return typeof parsed.token === "string" ? parsed.token : null;
  } catch {
    return null;
  }
}
