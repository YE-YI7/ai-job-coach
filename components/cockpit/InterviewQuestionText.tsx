import type { CSSProperties, ReactNode } from "react";

/** Reading-only formatting. Original text remains the source for speech and assessment. */
export function questionReadingSegments(question: string): string[] {
  if (question.length < 110) return [question];
  const segments: string[] = [];
  let start = 0;
  for (let index = 0; index < question.length; index += 1) {
    if (!/[。！？\n]/u.test(question[index])) continue;
    while (/[”’」』）】]/u.test(question[index + 1] || " ")) index += 1;
    const end = index + 1;
    if (end - start < 55 || question.length - end < 25 || segments.length >= 2) continue;
    segments.push(question.slice(start, end));
    start = end;
  }
  segments.push(question.slice(start));
  return segments;
}

type EmphasisRange = { start: number; end: number; tone: "accent" | "ink" };

/** Emphasize literal asking cues, never score facts or generate an answer outline. */
export function questionEmphasisRanges(question: string): EmphasisRange[] {
  const ranges: EmphasisRange[] = [];
  const patterns = [
    { tone: "accent" as const, pattern: /如何定义问题|如何区分|如何判断|如何验证|怎么验证|为什么|改变什么|取舍|评测指标/gu, limit: 3 },
    { tone: "ink" as const, pattern: /工程手段|判断依据|设计对照|实际负责|失败恢复|个人贡献|实际结果|对照实验|验证方式/gu, limit: 3 },
  ];
  for (const { tone, pattern, limit } of patterns) {
    let count = 0;
    for (const match of question.matchAll(pattern)) {
      if (count >= limit) break;
      ranges.push({ start: match.index, end: match.index + match[0].length, tone });
      count += 1;
    }
  }
  if (!ranges.some(range => range.tone === "accent")) {
    const askingClause = /(?:如何|怎么|怎样|为何|为什么|哪些|哪种|是否)[^，、。！？；\n]{0,16}(?=[，、。！？；\n]|$)/gu;
    let remaining = Math.min(36, Math.max(12, Math.floor(question.length * .2)));
    let count = 0;
    for (const match of question.matchAll(askingClause)) {
      const start = match.index, end = start + match[0].length;
      if (count >= 2) break;
      if (match[0].length > remaining || ranges.some(range => start < range.end && end > range.start)) continue;
      ranges.push({ start, end, tone: "accent" });
      remaining -= match[0].length;
      count += 1;
    }
  }
  return ranges.sort((a, b) => a.start - b.start);
}

export default function InterviewQuestionText({ question }: { question: string }) {
  const segments = questionReadingSegments(question);
  const ranges = questionEmphasisRanges(question);
  return <h3 data-question-length={question.length >= 110 ? "long" : "short"}>
    {segments.map((segment, index) => {
      const start = segments.slice(0, index).reduce((length, prior) => length + prior.length, 0);
      const end = start + segment.length;
      const localRanges = ranges.filter(range => range.start >= start && range.end <= end);
      let cursor = 0;
      const parts: ReactNode[] = [];
      for (const range of localRanges) {
        parts.push(segment.slice(cursor, range.start - start));
        parts.push(<strong key={range.start} data-question-emphasis={range.tone}>
          {segment.slice(range.start - start, range.end - start)}
        </strong>);
        cursor = range.end - start;
      }
      parts.push(segment.slice(cursor));
      return <span data-question-paragraph key={index} style={{ "--paragraph": index } as CSSProperties}>{parts}</span>;
    })}
  </h3>;
}
