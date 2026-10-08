import type { ResumeBlock } from "@/lib/opportunities/resume-blocks";

// Parser IDs contain list positions, so they cannot identify the same content
// after reordering. Occurrence numbers also keep repeated sections distinct.
export function resumeMotionKeys(blocks: ResumeBlock[]): string[] {
  const counts = new Map<string, number>();
  return blocks.map(block => {
    const content = JSON.stringify([block.kind, block.lines, Boolean(block.synthetic)]);
    const occurrence = counts.get(content) ?? 0;
    counts.set(content, occurrence + 1);
    return `${content}:${occurrence}`;
  });
}

export function resumeMoveTarget(ids: string[], index: number, direction: -1 | 1): string | null {
  return ids[index + direction] ?? null;
}
