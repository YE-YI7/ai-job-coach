/** 仅处理整行结构符；行内片段保留空格，避免英文单词粘连。 */
export function markdownSegments(raw: string): Array<{ text: string; bold: boolean }> {
  const line = raw.replace(/^\s*#{1,6}\s+/, "").replace(/^\s*[-*•·]+\s+/, "");
  return line.split(/(\*\*[^*]+\*\*|__[^_]+__)/).filter(Boolean).map((part) => {
    const bold = /^\*\*[^*]+\*\*$/.test(part) || /^__[^_]+__$/.test(part);
    return { text: bold ? part.slice(2, -2) : part.replace(/`([^`]+)`/g, "$1"), bold };
  });
}
