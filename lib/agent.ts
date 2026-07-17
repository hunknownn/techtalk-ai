import { query } from "@anthropic-ai/claude-agent-sdk";
import type { UserRuntime } from "./userenv";

/**
 * 유틸리티용 1회성 에이전트 호출 (스트리밍·스킬 없이 텍스트만).
 * 채팅과 동일한 사용자 격리(HOME·본인 구독 토큰)를 쓴다.
 */
export async function runAgentText(opts: {
  prompt: string;
  rt: UserRuntime;
  token: string;
  model?: string;
}): Promise<string> {
  const { prompt, rt, token, model } = opts;
  const q = query({
    prompt,
    options: {
      cwd: rt.outputDir,
      permissionMode: "bypassPermissions",
      // 스킬·도구 불필요: 순수 추론 응답만
      settingSources: [],
      allowedTools: [],
      ...(process.env.CLAUDE_CODE_PATH
        ? { pathToClaudeCodeExecutable: process.env.CLAUDE_CODE_PATH }
        : {}),
      env: {
        ...(process.env as Record<string, string>),
        HOME: rt.home,
        CLAUDE_CODE_OAUTH_TOKEN: token,
      },
      ...(model && model !== "default" ? { model } : {}),
    },
  });

  let text = "";
  for await (const msg of q) {
    if (msg.type === "assistant") {
      for (const block of msg.message.content) {
        if (block.type === "text") text += block.text;
      }
    }
  }
  return text;
}

/** 응답에서 JSON 블록 추출 (```json 펜스 우선, 없으면 첫 { ~ 마지막 }) */
export function extractJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced
    ? fenced[1]
    : text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return JSON.parse(raw) as T;
}
