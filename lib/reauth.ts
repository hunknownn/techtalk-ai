import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as pty from "node-pty";

/**
 * 구독 토큰 바인딩: `claude setup-token`을 PTY로 구동해
 * 인증 URL을 웹에 보여주고, 사용자가 붙여넣은 코드를 stdin으로 전달한다.
 *
 * 핵심: 토큰의 주인은 "OAuth URL에 누가 로그인했나"로 결정된다.
 * 그래서 프로세스는 온보딩이 끝난 파드 기본 홈에서 돌리고(신선한 홈의
 * TUI 온보딩 함정 회피), 발급된 토큰만 요청한 사용자의 슬롯에 저장한다.
 */

type Phase = "idle" | "starting" | "waiting_code" | "exchanging" | "done" | "error";

export interface ReauthState {
  phase: Phase;
  url: string | null;
  message: string | null;
}

const SESSION_TIMEOUT_MS = 10 * 60 * 1000;

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07]*\x07/g;

class ReauthSession {
  private proc: pty.IPty | null = null;
  private buffer = "";
  private timeout: NodeJS.Timeout | null = null;
  constructor(private tokenFile: string) {}
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

    if (!this.state.url) {
      const url = this.buffer.match(
        /https:\/\/(?:claude\.(?:ai|com)|console\.anthropic\.com)\/[^\s"')]+/
      );
      if (url) {
        this.state = { phase: "waiting_code", url: url[0], message: null };
      }
    }

    const token = this.buffer.match(/sk-ant-oat01-[A-Za-z0-9_-]{20,}/);
    if (token && this.state.phase !== "done") {
      fs.mkdirSync(path.dirname(this.tokenFile), { recursive: true });
      fs.writeFileSync(
        this.tokenFile,
        JSON.stringify({ token: token[0], createdAt: new Date().toISOString() }),
        { mode: 0o600 }
      );
      this.state = {
        phase: "done",
        url: null,
        message: "구독 연결 완료. 이제 대화를 시작할 수 있습니다.",
      };
      this.stop();
    }
  }

  submitCode(code: string) {
    if (!this.proc || this.state.phase !== "waiting_code") {
      throw new Error("코드를 받을 단계가 아닙니다. 연결을 먼저 시작하세요.");
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

// 사용자별 재인증 세션 (핫리로드에도 유지)
const g = globalThis as unknown as {
  __reauthSessions?: Map<number, ReauthSession>;
};
const sessions = g.__reauthSessions ?? (g.__reauthSessions = new Map());

export function getReauthSession(
  userId: number,
  tokenFile: string
): ReauthSession {
  let s = sessions.get(userId);
  if (!s) {
    s = new ReauthSession(tokenFile);
    sessions.set(userId, s);
  }
  return s;
}
