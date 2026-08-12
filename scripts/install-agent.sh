#!/bin/sh
set -eu

REPOSITORY="${YI_ZHI_REPOSITORY:-YE-YI7/ai-job-coach}"
BRANCH="${YI_ZHI_BRANCH:-backend}"
TARGET="${1:-agents}"
ARCHIVE_URL="${YI_ZHI_ARCHIVE_URL:-https://codeload.github.com/${REPOSITORY}/tar.gz/refs/heads/${BRANCH}}"

case "$TARGET" in
  codex) DESTINATION="${CODEX_HOME:-$HOME/.codex}/skills" ;;
  claude) DESTINATION="$HOME/.claude/skills" ;;
  workbuddy) DESTINATION="${WORKBUDDY_HOME:-$HOME/.workbuddy}/skills" ;;
  agents|generic) DESTINATION="$HOME/.agents/skills" ;;
  *)
    printf '用法: install-agent.sh [codex|claude|workbuddy|agents]\n' >&2
    exit 2
    ;;
esac

if ! command -v curl >/dev/null 2>&1; then
  printf '安装失败：需要 curl。\n' >&2
  exit 1
fi

if [ "$TARGET" = "workbuddy" ] && ! command -v node >/dev/null 2>&1; then
  printf '安装失败：益职本地作战台需要 Node.js 18 或更高版本。\n' >&2
  exit 1
fi

INSTALL_TMP="$(mktemp -d "${TMPDIR:-/tmp}/yi-zhi-install.XXXXXX")"
trap 'rm -rf "$INSTALL_TMP"' EXIT HUP INT TERM

curl -fsSL "$ARCHIVE_URL" | tar -xz -C "$INSTALL_TMP"
SOURCE_ROOT="$(find "$INSTALL_TMP" -type d -path '*/.agents/plugins/plugins/yi-zhi/skills' -print -quit)"

if [ -z "$SOURCE_ROOT" ]; then
  printf '安装失败：发布包中没有找到益职 Skills。\n' >&2
  exit 1
fi
PLUGIN_ROOT="$(dirname "$SOURCE_ROOT")"

mkdir -p "$DESTINATION"

for SOURCE_SKILL in "$SOURCE_ROOT"/*; do
  [ -d "$SOURCE_SKILL" ] || continue
  SKILL_NAME="$(basename "$SOURCE_SKILL")"
  TARGET_SKILL="$DESTINATION/$SKILL_NAME"
  if [ -e "$TARGET_SKILL" ]; then
    BACKUP_SKILL="$TARGET_SKILL.backup.$(date +%Y%m%d%H%M%S)"
    mv "$TARGET_SKILL" "$BACKUP_SKILL"
    printf '已备份旧版本：%s\n' "$BACKUP_SKILL"
  fi
  cp -R "$SOURCE_SKILL" "$TARGET_SKILL"
done

if [ "$TARGET" = "workbuddy" ]; then
  WORKBUDDY_ROOT="${WORKBUDDY_HOME:-$HOME/.workbuddy}"
  MCP_DESTINATION="$WORKBUDDY_ROOT/yi-zhi/mcp/server.mjs"
  NODE_COMMAND="$(command -v node)"
  mkdir -p "$(dirname "$MCP_DESTINATION")"
  cp "$PLUGIN_ROOT/mcp/server.mjs" "$MCP_DESTINATION"
  "$NODE_COMMAND" "$INSTALL_TMP"/*/scripts/configure-workbuddy-mcp.mjs "$WORKBUDDY_ROOT/mcp.json" "$MCP_DESTINATION" "$NODE_COMMAND"
  printf '\n益职 Skills 已安装到 %s\n' "$DESTINATION"
  printf '益职本地求职作战台已配置到 %s\n' "$WORKBUDDY_ROOT/mcp.json"
  printf '重新启动 WorkBuddy，然后说：我正在找工作，但不知道从哪开始。\n'
else
  printf '\n益职 AI 已安装到 %s\n' "$DESTINATION"
  printf '重新启动 Agent，然后说：我正在找工作，但不知道从哪开始。\n'
fi
