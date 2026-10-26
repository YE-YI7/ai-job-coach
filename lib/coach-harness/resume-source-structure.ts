/** Text structure only. Never infer PDF geometry or rewrite source facts. */
export function resumeLeadIn(line: string) {
  const text = line.replace(/^\s*(?:[-*•●]\s+|\d+[.)]\s+)/, '').trim();
  const bold = text.match(/^\*\*([^*\n]{2,80})\*\*[：:。.]?\s*(.*)$/);
  if (bold) return { label: bold[1], body: bold[2], style: 'bold' as const };
  const plain = text.match(/^([^:：\n]{2,48})[:：]\s*(\S.*)$/);
  if (!plain || /[，,。；;！？!?=@]/.test(plain[1])
    || /^\d[\d.\-/年 月]*$|^https?$/i.test(plain[1].trim())
    // A wrapped body clause before a colon is not a new noun-phrase heading.
    || /(?:人员|用户|客户|同事|团队).{0,10}(?:自主|可以|能够|维护|查询|使用|进行|完成)/.test(plain[1])) return null;
  return { label: plain[1].trim(), body: plain[2], style: 'plain' as const };
}

export function resumeBodyWithoutLeadIns(text: string) {
  return text.split(/\r?\n/).map(line => resumeLeadIn(line)?.body
    ?? line.replace(/^\s*[-*•●]\s+/, '')).join('\n');
}

/** Join physical OCR wraps only inside a paragraph; keep original byte spans.
 * New labels, list items, blank lines and entry/date headings are boundaries. */
export function resumeSourceParagraphs(source: string): string[] {
  const lines = [...source.matchAll(/[^\r\n]+|\r?\n/g)];
  const result: string[] = [];
  let start = -1, end = -1, previous = '', joining = false;
  const flush = () => {
    if (start >= 0) result.push(source.slice(start, end).trim());
    start = -1; joining = false;
  };
  for (const item of lines) {
    const raw = item[0], line = raw.trim();
    if (/^\r?\n$/.test(raw)) {
      // A second consecutive newline is a real paragraph boundary.
      if (/\r?\n\s*\r?\n/.test(source.slice(end, item.index! + raw.length))) flush();
      continue;
    }
    if (!line) { flush(); continue; }
    const labelled = Boolean(resumeLeadIn(line));
    const listed = /^\s*(?:[-*•●]\s+|\d+[.)]\s+)/.test(raw);
    const entry = /^\s*#{1,6}\s|^\d{4}[.\-/年]|^[^，,。；;:：！？!?]{1,40}$/.test(line);
    if (start >= 0 && (!joining || labelled || listed || entry || /[。.!！?？]$/.test(previous))) flush();
    if (start < 0) start = item.index!;
    end = item.index! + raw.length;
    previous = line;
    joining = joining || labelled || listed || line.length >= 40;
  }
  flush();
  return result.filter(Boolean);
}
