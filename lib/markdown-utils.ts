import React from 'react';

/**
 * 解析 Markdown 格式的文本，将 **text** 转换为加粗样式
 * @param text 原始文本
 * @returns React 元素数组
 */
export function parseMarkdownBold(text: string): (string | React.ReactElement)[] {
  const parts: (string | React.ReactElement)[] = [];
  let lastIndex = 0;
  let key = 0;

  // 匹配 **text** 格式
  const boldRegex = /\*\*(.+?)\*\*/g;
  let match;

  while ((match = boldRegex.exec(text)) !== null) {
    // 添加匹配前的普通文本
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    // 添加加粗的文本（不包含 ** 符号）
    parts.push(
      React.createElement('strong', {
        key: `bold-${key++}`,
        className: 'font-semibold'
      }, match[1])
    );

    lastIndex = match.index + match[0].length;
  }

  // 添加剩余的普通文本
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}
