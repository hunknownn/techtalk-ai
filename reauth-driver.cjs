/**
 * 구독 재인증 드라이버 (detached 백그라운드 프로세스).
 *
 * 재인증 세션을 서버 메모리에 들면 Next.js 요청 간 인스턴스가 갈려
 * "코드 제출"과 "상태 폴링"이 서로 다른 세션을 봐서 깨진다.
 * 그래서 pty 프로세스를 이 독립 프로세스로 돌리고, 상태·URL·코드를
 * 파일(PVC)로 주고받는다. 어느 요청 인스턴스가 처리하든, 파드가
 * 재시작하지만 않으면 일관되게 동작한다.
 *
 * argv: <workdir> <tokenFile>
 * 파일: workdir/phase.txt(JSON), workdir/url.txt, workdir/code.txt
 *       성공 시 tokenFile 에 {token, createdAt} 기록
 */
const pty = require("node-pty");
const fs = require("fs");
const path = require("path");

const workdir = process.argv[2];
const tokenFile = process.argv[3];
const CLAUDE = process.env.CLAUDE_CODE_PATH || "claude";
const ANSI = /\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07]*\x07/g;

const phaseFile = path.join(workdir, "phase.txt");
const urlFile = path.join(workdir, "url.txt");
const codeFile = path.join(workdir, "code.txt");

fs.mkdirSync(workdir, { recursive: true });
function setPhase(phase, message) {
  fs.writeFileSync(
    phaseFile,
    JSON.stringify({ phase, message: message || null })
  );
}
function curPhase() {
  try {
    return JSON.parse(fs.readFileSync(phaseFile, "utf8")).phase;
  } catch {
    return null;
  }
}

setPhase("starting");

const p = pty.spawn(CLAUDE, ["setup-token"], {
  name: "xterm-256color",
  cols: 1000,
  rows: 50,
  cwd: process.env.HOME || "/home/app",
  env: process.env,
});

let buf = "";
let urlWritten = false;
let codeSent = false;

p.onData((d) => {
  buf += d.replace(ANSI, "");
  if (!urlWritten) {
    const m = buf.match(
      /https:\/\/(?:claude\.(?:ai|com)|console\.anthropic\.com)\/[^\s"')]+/
    );
    if (m) {
      fs.writeFileSync(urlFile, m[0]);
      urlWritten = true;
      setPhase("waiting_code");
    }
  }
  const t = buf.match(/sk-ant-oat01-[A-Za-z0-9_-]{20,}/);
  if (t && curPhase() !== "done") {
    fs.mkdirSync(path.dirname(tokenFile), { recursive: true });
    fs.writeFileSync(
      tokenFile,
      JSON.stringify({ token: t[0], createdAt: new Date().toISOString() }),
      { mode: 0o600 }
    );
    setPhase("done", "구독 연결 완료");
    setTimeout(() => process.exit(0), 500);
  }
});

const iv = setInterval(() => {
  if (!codeSent && urlWritten && fs.existsSync(codeFile)) {
    const code = fs.readFileSync(codeFile, "utf8").trim();
    if (code) {
      codeSent = true;
      setPhase("exchanging");
      try {
        fs.unlinkSync(codeFile);
      } catch {}
      // Ink 입력 TUI: 코드 붙여넣기와 Enter를 한 번에 보내면 Enter가
      // 붙여넣기 텍스트로 흡수돼 제출이 안 됨 → 분리해서 전송
      p.write(code);
      setTimeout(() => p.write("\r"), 600);
    }
  }
}, 1000);

p.onExit(({ exitCode }) => {
  clearInterval(iv);
  if (curPhase() !== "done") {
    setPhase("error", `setup-token 종료 (exit ${exitCode})`);
  }
  process.exit(0);
});

// 10분 타임아웃
setTimeout(() => {
  if (curPhase() !== "done") setPhase("error", "시간 초과 (10분)");
  try {
    p.kill();
  } catch {}
  process.exit(1);
}, 600000);
