#!/bin/bash
set -e

# PVC가 $HOME을 마운트하면 이미지에 구운 스킬이 가려지므로,
# 기동 시마다 이미지 원본(/opt/skills)을 홈으로 동기화한다.
# 인증 파일(.claude.json, .claude/ 나머지)은 건드리지 않는다.
mkdir -p "$HOME/.claude/skills"
# 단, taxonomy.md는 스킬이 런타임에 ✅ 마킹·소주제 추가로 키우는 상태 파일이라
# PVC에 이미 있으면 이미지 시드로 덮어쓰지 않고 보존한다
LIVE_TAXONOMY="$HOME/.claude/skills/techtalk/taxonomy.md"
if [ -f "$LIVE_TAXONOMY" ]; then
  cp -f "$LIVE_TAXONOMY" /tmp/taxonomy.keep
  cp -rf /opt/skills/. "$HOME/.claude/skills/"
  mv -f /tmp/taxonomy.keep "$LIVE_TAXONOMY"
else
  cp -rf /opt/skills/. "$HOME/.claude/skills/"
fi

# 산출물·데이터 디렉토리 보장 (PVC 첫 마운트 대비)
mkdir -p "$TECHTALK_OUTPUT_DIR" "$TECHTALK_DATA_DIR"

exec "$@"
