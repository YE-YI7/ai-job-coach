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

if ! command -v node >/dev/null 2>&1; then
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
YI_ZHI_ROOT="${YI_ZHI_HOME:-$HOME/.yi-zhi}"
MCP_DESTINATION="$YI_ZHI_ROOT/mcp/server.mjs"
KNOWLEDGE_DESTINATION="$YI_ZHI_ROOT/knowledge/knowledge-documents.json"
RELEASE_DESTINATION="$YI_ZHI_ROOT/release.json"
NODE_COMMAND="$(command -v node)"

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

mkdir -p "$(dirname "$MCP_DESTINATION")"
cp "$PLUGIN_ROOT/mcp/server.mjs" "$MCP_DESTINATION"
mkdir -p "$(dirname "$KNOWLEDGE_DESTINATION")"
cp "$PLUGIN_ROOT/knowledge/knowledge-documents.json" "$KNOWLEDGE_DESTINATION"
cp "$PLUGIN_ROOT/release.json" "$RELEASE_DESTINATION"

if [ "$TARGET" = "workbuddy" ]; then
  WORKBUDDY_ROOT="${WORKBUDDY_HOME:-$HOME/.workbuddy}"
  "$NODE_COMMAND" "$INSTALL_TMP"/*/scripts/configure-workbuddy-mcp.mjs "$WORKBUDDY_ROOT/mcp.json" "$MCP_DESTINATION" "$NODE_COMMAND"
  printf '\n益职 Skills 已安装到 %s\n' "$DESTINATION"
  printf '益职本地 MCP 已安装到 %s\n' "$MCP_DESTINATION"
  printf '益职知识库已安装到 %s\n' "$KNOWLEDGE_DESTINATION"
  printf '每次启动会读取本地版本状态；联网版本检查每周最多一次，不会静默覆盖本地数据。\n'
  printf '益职本地求职作战台已配置到 %s\n' "$WORKBUDDY_ROOT/mcp.json"
  printf '重新启动 WorkBuddy，并让 Agent 验证本地作战盘链接。\n'
else
  printf '\n益职 AI 已安装到 %s\n' "$DESTINATION"
  printf '益职本地 MCP 已准备到 %s\n' "$MCP_DESTINATION"
  printf '益职知识库已安装到 %s\n' "$KNOWLEDGE_DESTINATION"
  printf '每次启动会读取本地版本状态；联网版本检查每周最多一次，不会静默覆盖本地数据。\n'
  if [ "$TARGET" = "codex" ]; then
    printf '推荐通过 Codex Marketplace 安装完整 Plugin；仅使用本脚本时，请把上面的 MCP 服务注册到 Codex。\n'
  else
    printf '请让当前 Agent 按 https://ai-job-coach.xin/agent 注册上面的 MCP 服务。\n'
  fi
  printf '重新启动或新建会话后，验证本地作战盘链接再开始第一个岗位。\n'
fi
