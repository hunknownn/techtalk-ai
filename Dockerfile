# ---- build ----
FROM node:20-bookworm-slim AS builder
# better-sqlite3 네이티브 빌드용 툴체인 (프리빌드 없는 아키텍처 대비)
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- runtime ----
FROM node:20-bookworm-slim

# git/ripgrep: Claude Code(Agent SDK 런타임)의 Bash·Grep 도구가 사용
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ripgrep ca-certificates procps \
  && rm -rf /var/lib/apt/lists/*

# 운영 편의용 CLI (파드 안에서 claude login / 상태 점검)
RUN npm install -g @anthropic-ai/claude-code

# non-root 실행 유저. $HOME은 PVC(claude-auth)가 마운트되는 지점
RUN useradd -m -u 1001 app
ENV HOME=/home/app \
    TECHTALK_DATA_DIR=/data \
    TECHTALK_OUTPUT_DIR=/home/app/techtalk \
    NODE_ENV=production \
    PORT=3000

WORKDIR /app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# 스킬 원본은 이미지에 보관, 기동 시 $HOME으로 동기화 (PVC가 홈을 덮는 문제 회피)
COPY skills /opt/skills
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
  && mkdir -p /data \
  && chown -R app:app /data /app /home/app

USER app
EXPOSE 3000
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
