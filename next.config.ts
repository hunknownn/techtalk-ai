import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 네이티브 모듈·CLI 실행 의존성은 번들링에서 제외 (Node require로 직접 로드)
  serverExternalPackages: [
    "better-sqlite3",
    "@anthropic-ai/claude-agent-sdk",
    "node-pty",
  ],
  // 파드 배포용 최소 러너 출력
  output: "standalone",
};

export default nextConfig;
