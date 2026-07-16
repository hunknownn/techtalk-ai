#!/bin/bash
set -e

# PVC가 $HOME을 마운트하면 이미지에 구운 스킬이 가려지므로,
# 기동 시마다 이미지 원본(/opt/skills)을 홈으로 동기화한다.
# 인증 파일(.claude.json, .claude/ 나머지)은 건드리지 않는다.
mkdir -p "$HOME/.claude/skills"
cp -rf /opt/skills/. "$HOME/.claude/skills/"

# 산출물·데이터 디렉토리 보장 (PVC 첫 마운트 대비)
mkdir -p "$TECHTALK_OUTPUT_DIR" "$TECHTALK_DATA_DIR"

exec "$@"
