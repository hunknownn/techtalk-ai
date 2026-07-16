import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as pty from "node-pty";

/**
 * 웹 재인증: `claude setup-token`(구독용 장기 토큰 발급)을 PTY로 구동해
 * 인증 URL을 웹에 보여주고, 사용자가 붙여넣은 코드를 stdin으로 전달한다.
 * SSH 없이 브라우저만으로 토큰 갱신이 목적.
 */

type Phase = "idle" | "starting" | "waiting_code" | "exchanging" | "done" | "error";

export interface ReauthState {
  phase: Phase;
  url: string | null;
  message: string | null;
}

const DATA_DIR =
  process.env.TECHTALK_DATA_DIR ?? path.join(process.cwd(), "data");
export const TOKEN_FILE = path.join(DATA_DIR, "claude-oauth.json");

const SESSION_TIMEOUT_MS = 10 * 60 * 1000;

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07]*\x07/g;

class ReauthSession {
  private proc: pty.IPty | null = null;
  private buffer = "";
  private timeout: NodeJS.Timeout | null = null;
  state: ReauthState = { phase: "idle", url: null, message: null };

  start() {
    this.stop();
    this.buffer = "";
    this.state = { phase: "starting", url: null, message: null };

    const exe = process.env.CLAUDE_CODE_PATH ?? "claude";
    try {
      this.proc = pty.spawn(exe, ["setup-token"], {
        name: "xterm-256color",
        // 인증 URL(~350자)이 줄바꿈으로 잘리지 않도록 충분히 넓게
        cols: 1000,
        rows: 50,
        cwd: os.homedir(),
        env: process.env as Record<string, string>,
      });
    } catch (e) {
      this.state = {
        phase: "error",
        url: null,
        message: `claude 실행 실패: ${e instanceof Error ? e.message : String(e)}`,
      };
      return;
    }

    this.proc.onData((chunk) => this.handleOutput(chunk));
    this.proc.onExit(({ exitCode }) => {
      if (this.state.phase !== "done" && this.state.phase !== "error") {
        this.state = {
          phase: exitCode === 0 ? "done" : "error",
          url: this.state.url,
          message:
            exitCode === 0
              ? this.state.message
              : `setup-token 종료 (exit ${exitCode})`,
        };
      }
      this.proc = null;
    });

    this.timeout = setTimeout(() => {
      if (this.state.phase !== "done") {
        this.state = { phase: "error", url: null, message: "시간 초과 (10분)" };
        this.stop();
      }
    }, SESSION_TIMEOUT_MS);
  }

  private handleOutput(chunk: string) {
    this.buffer += chunk.replace(ANSI_RE, "");

    // 인증 URL 감지 → 사용자에게 표시할 단계
    if (!this.state.url) {
      const url = this.buffer.match(
        /https:\/\/(?:claude\.(?:ai|com)|console\.anthropic\.com)\/[^\s"')]+/
      );
      if (url) {
        this.state = { phase: "waiting_code", url: url[0], message: null };
      }
    }

    // 장기 토큰 발급 성공 감지 → 저장
    const token = this.buffer.match(/sk-ant-oat01-[A-Za-z0-9_-]{20,}/);
    if (token && this.state.phase !== "done") {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(
        TOKEN_FILE,
        JSON.stringify({ token: token[0], createdAt: new Date().toISOString() }),
        { mode: 0o600 }
      );
      this.state = {
        phase: "done",
        url: null,
        message: "토큰 발급 완료. 이후 대화부터 새 토큰을 사용합니다.",
      };
      this.stop();
    }
  }

  submitCode(code: string) {
    if (!this.proc || this.state.phase !== "waiting_code") {
      throw new Error("코드를 받을 단계가 아닙니다. 재인증을 먼저 시작하세요.");
    }
    this.state = { ...this.state, phase: "exchanging" };
    this.proc.write(code.trim() + "\r");
  }

  stop(message?: string) {
    if (this.timeout) clearTimeout(this.timeout);
    this.timeout = null;
    if (this.proc) {
      try {
        this.proc.kill();
      } catch {
        /* 이미 종료됨 */
      }
      this.proc = null;
    }
    if (message) this.state = { phase: "error", url: null, message };
  }
}

// 핫리로드·요청 간 단일 세션 유지 (동시 재인증은 의미 없음)
const g = globalThis as unknown as { __reauthSession?: ReauthSession };
export const reauthSession =
  g.__reauthSession ?? (g.__reauthSession = new ReauthSession());

/** 저장된 장기 토큰 (없으면 null). 채팅 라우트가 env로 주입해 사용 */
export function readLongLivedToken(): string | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(TOKEN_FILE, "utf-8"));
    return typeof parsed.token === "string" ? parsed.token : null;
  } catch {
    return null;
  }
}

/** 기본 인증(.credentials.json)의 만료 시각 조회 */
export function readCredentialsExpiry(): {
  exists: boolean;
  expiresAt: string | null;
} {
  try {
    const raw = JSON.parse(
      fs.readFileSync(
        path.join(os.homedir(), ".claude", ".credentials.json"),
        "utf-8"
      )
    );
    const ms = raw?.claudeAiOauth?.expiresAt;
    return {
      exists: true,
      expiresAt: typeof ms === "number" ? new Date(ms).toISOString() : null,
    };
  } catch {
    return { exists: false, expiresAt: null };
  }
}
