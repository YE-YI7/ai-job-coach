#!/bin/sh
set -eu

REPOSITORY="${YI_ZHI_REPOSITORY:-YE-YI7/ai-job-coach}"
BRANCH="${YI_ZHI_BRANCH:-backend}"
TARGET="${1:-agents}"
ARCHIVE_URL="${YI_ZHI_ARCHIVE_URL:-https://codeload.github.com/${REPOSITORY}/tar.gz/refs/heads/${BRANCH}}"

case "$TARGET" in
  codex) DESTINATION="${CODEX_HOME:-$HOME/.codex}/skills" ;;
  claude) DESTINATION="$HOME/.claude/skills" ;;
  agents|generic) DESTINATION="$HOME/.agents/skills" ;;
  *)
    printf '用法: install-agent.sh [codex|claude|agents]\n' >&2
    exit 2
    ;;
esac

if ! command -v curl >/dev/null 2>&1; then
  printf '安装失败：需要 curl。\n' >&2
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

printf '\n益职 AI 已安装到 %s\n' "$DESTINATION"
printf '重新启动你的 Agent，然后说：帮我选择下一步最值得做的求职任务。\n'
