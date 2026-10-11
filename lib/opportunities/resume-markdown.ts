/** 仅处理整行结构符；行内片段保留空格，避免英文单词粘连。 */
export function isResumePageBreak(raw: string): boolean {
  return /^\s*<!--\s*PAGEBREAK\s*-->\s*$/i.test(raw);
}

export function markdownSegments(raw: string): Array<{ text: string; bold: boolean; href?: string }> {
  const line = raw.replace(/^\s*#{1,6}\s+/, "").replace(/^\s*[-*•·]+\s+/, "");
  return line.split(/(\[[^\]]+\]\([^\s)]+\)|\*\*[^*]+\*\*|__[^_]+__)/).filter(Boolean).map((part) => {
    const link = part.match(/^\[([^\]]+)\]\(([^\s)]+)\)$/);
    if (link) return { text: link[1], bold: false, ...(/^(https?:\/\/|mailto:)/i.test(link[2]) ? { href: link[2] } : {}) };
    const bold = /^\*\*[^*]+\*\*$/.test(part) || /^__[^_]+__$/.test(part);
    return { text: bold ? part.slice(2, -2) : part.replace(/`([^`]+)`/g, "$1"), bold };
  });
}
