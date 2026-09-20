import type { Opportunity, ResumeChange } from "./types";

export type ResumeBlockKind = "header" | "summary" | "education" | "experience" | "project" | "skill" | "other";

export interface ResumeBlock {
  id: string;
  kind: ResumeBlockKind;
  title: string;
  lines: string[];
  changeIds: string[];
  /** Raw section header line this block sat under (null = no header). */
  heading: string | null;
  /** True for the synthesized 其他调整 block; its content is not resume text. */
  synthetic?: boolean;
}

// A line is a section header only when it is short AND opens with a known
// resume keyword, so ordinary bullets ("负责项目重构") are never mistaken for
// a header.
const SECTION_PATTERNS: Array<{ kind: ResumeBlockKind; test: RegExp }> = [
  { kind: "education", test: /^(教育背景|教育经历|学历|教育)/ },
  { kind: "project", test: /^(项目经历|项目经验|代表项目|主要项目|项目)/ },
  { kind: "experience", test: /^(工作经历|实习经历|职业经历|工作经验|相关经历|校园经历|社团经历|课外活动)/ },
  { kind: "skill", test: /^(专业技能|职业技能|技能|证书|荣誉|获奖)/ },
  { kind: "summary", test: /^(自我评价|个人简介|个人总结|自我介绍|简介|总结)/ },
];

function classifyHeader(line: string): { kind: ResumeBlockKind; title: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 16) return null;
  // A header labels a section; it carries no data itself. "技能：Python" is a
  // content line — treating it as a header would swallow the text after the
  // colon, which reconstruct can never give back.
  const colon = trimmed.search(/[:：]/);
  if (colon >= 0 && trimmed.slice(colon + 1).trim()) return null;
  for (const { kind, test } of SECTION_PATTERNS) {
    if (test.test(trimmed)) return { kind, title: trimmed.replace(/[:：\s]+$/, "") };
  }
  return null;
}

// whitespace-insensitive containment so a change maps to a block even if the
// resume text and the recorded `before` differ in spacing / newlines.
function normalize(value: string): string {
  return value.replace(/\s+/g, "");
}

function isSplitKind(kind: ResumeBlockKind): boolean {
  return kind === "experience" || kind === "project";
}

/**
 * Split a plain-text resume into ordered blocks (one card each). Sections that
 * hold multiple entries (project / experience) are split on blank lines so each
 * internship or project becomes its own card; a dated line also starts a new
 * entry so resumes without blank-line separators still split. When no header is
 * recognised the whole text becomes a single `other` block.
 */
export function splitResumeBlocks(text: string): ResumeBlock[] {
  const lines = (text || "").replace(/\r\n/g, "\n").split("\n");
  const blocks: ResumeBlock[] = [];
  let sectionTitle: string | null = null;
  let sectionKind: ResumeBlockKind = "header";
  let sectionHeading: string | null = null;
  let groups: string[][] = [];      // non-empty line groups for the current section
  let current: string[] = [];

  const pushGroup = () => {
    if (current.length) groups.push(current);
    current = [];
  };

  const flush = () => {
    pushGroup();
    const madeGroups = groups.filter((g) => g.some((l) => l.trim()));
    groups = [];
    if (!madeGroups.length) {
      // A section header with no content lines below it (trailing "专业技能", or
      // two headers in a row). Keep the line as its own block so a rebuild
      // after reorder can never drop it.
      if (sectionHeading) {
        blocks.push({ id: `${sectionKind}-${blocks.length}`, kind: sectionKind, title: sectionTitle || sectionHeading, lines: [], changeIds: [], heading: sectionHeading });
      }
      return;
    }
    if (isSplitKind(sectionKind) && sectionTitle) {
      // one card per blank-line group; additionally split inside a group when a
      // dated line follows a non-dated opener (entries usually start with dates).
      const entries: string[][] = [];
      for (const group of madeGroups) {
        let entry: string[] = [];
        for (const line of group) {
          if (entry.length && /\d{4}/.test(line) && !/\d{4}/.test(entry[0])) { entries.push(entry); entry = [line]; }
          else entry.push(line);
        }
        if (entry.length) entries.push(entry);
      }
      for (const entry of entries) {
        blocks.push({ id: `${sectionKind}-${blocks.length}`, kind: sectionKind, title: sectionTitle, lines: entry, changeIds: [], heading: sectionHeading });
      }
    } else {
      blocks.push({ id: `${sectionKind}-${blocks.length}`, kind: sectionKind, title: sectionTitle || madeGroups[0][0], lines: madeGroups.flat(), changeIds: [], heading: sectionTitle ? sectionHeading : null });
    }
  };

  for (const line of lines) {
    const header = classifyHeader(line);
    if (header) {
      flush();
      sectionKind = header.kind;
      sectionTitle = header.title;
      sectionHeading = line.trim();
      continue;
    }
    if (!line.trim()) {
      pushGroup();
      continue;
    }
    current.push(line);
  }
  flush();
  // No recognised headers at all: the lone preamble block is a plain block.
  if (blocks.length === 1 && blocks[0].kind === "header") blocks[0].kind = "other";
  return blocks;
}

/**
 * Attach changes to the block whose text contains their `before` (falling back
 * to a section-title match). Changes that match nothing are collected into a
 * trailing `其他调整` block so they stay reviewable rather than vanishing.
 */
export function assignChangesToBlocks(blocks: ResumeBlock[], changes: ResumeChange[]): ResumeBlock[] {
  const next = blocks.map((block) => ({ ...block, changeIds: [] as string[] }));
  const unmatched: ResumeChange[] = [];
  for (const change of changes) {
    const needle = normalize(change.before);
    let target: ResumeBlock | undefined;
    if (needle) target = next.find((block) => normalize(block.lines.join("\n")).includes(needle));
    if (!target) {
      const sectionNeedle = normalize(change.section);
      if (sectionNeedle) target = next.find((block) => normalize(block.title).includes(sectionNeedle) || block.lines.some((l) => normalize(l).includes(sectionNeedle)));
    }
    if (target) target.changeIds.push(change.id);
    else unmatched.push(change);
  }
  if (unmatched.length) {
    next.push({ id: `other-${next.length}`, kind: "other", title: "其他调整", lines: unmatched.map((c) => c.after || c.before), changeIds: unmatched.map((c) => c.id), heading: null, synthetic: true });
  }
  return next;
}

/**
 * Rebuild resume text from blocks in the given order. Blocks that share a
 * section heading (split project/experience cards) only re-emit it when the
 * previous block had a different one, so moving a card between sections keeps
 * its heading and consecutive siblings don't duplicate it. The synthesized
 * 其他调整 block is skipped: its lines are suggestions, not resume text.
 */
export function reconstructResumeText(blocks: ResumeBlock[]): string {
  const parts: string[] = [];
  let lastHeading: string | null = null;
  for (const block of blocks) {
    if (block.synthetic) continue;
    const lines: string[] = [];
    if (block.heading && block.heading !== lastHeading) lines.push(block.heading);
    lines.push(...block.lines);
    parts.push(lines.join("\n"));
    lastHeading = block.heading;
  }
  return parts.join("\n\n");
}

/**
 * Move the block `fromId` to `toId`'s position and return the reordered resume
 * text, or null when the move is a no-op or the ids don't exist in `text`.
 * Reordering here means the change lands in the real resume body — export,
 * quality checks and freeze all pick it up.
 */
export function reorderResumeText(text: string, fromId: string, toId: string): string | null {
  if (!text.trim() || fromId === toId) return null;
  const blocks = splitResumeBlocks(text);
  const ids = blocks.map((block) => block.id);
  const from = ids.indexOf(fromId);
  const to = ids.indexOf(toId);
  if (from < 0 || to < 0) return null;
  const next = [...blocks];
  next.splice(to, 0, ...next.splice(from, 1));
  return reconstructResumeText(next);
}

/**
 * Apply a block reorder to the real opportunity. Returns changed=false for a
 * no-op move. When the job already has a frozen application artifact, the new
 * body order no longer matches that artifact, so the frozen version is marked
 * stale: export must fall back to the current text and the progress flow
 * forces a re-check + re-freeze before another 投递版本 exists.
 */
export function applyReorderToOpportunity(
  opportunity: Opportunity,
  fromId: string,
  toId: string,
): { changed: boolean; invalidatedFreeze: boolean; opportunity: Opportunity } {
  const nextText = reorderResumeText(opportunity.resumeText || "", fromId, toId);
  if (nextText === null || nextText === opportunity.resumeText) {
    return { changed: false, invalidatedFreeze: false, opportunity };
  }
  const invalidatedFreeze = Boolean(opportunity.applicationQuality?.artifactId);
  return {
    changed: true,
    invalidatedFreeze,
    opportunity: { ...opportunity, resumeText: nextText, resumeCheckStale: true, ...(invalidatedFreeze ? { frozenStale: true } : null) },
  };
}
