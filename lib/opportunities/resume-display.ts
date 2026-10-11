import type { ResumeChange } from "./types";
import type { ResumeBlock } from "./resume-blocks";
import { applyResumeChanges } from "../coach-harness/application-quality";

/** Display and export obey the same unique-anchor/overlap rules. */
export function selectedResumeBlocks(source: string, blocks: ResumeBlock[], changes: ResumeChange[]) {
  const accepted = changes.filter(change => change.status === "accepted");
  const invalid = new Set(applyResumeChanges(source, accepted).findings.map(finding => finding.changeId));
  return blocks.map(block => {
    if (block.synthetic) return block;
    const selected = accepted.filter(change => block.changeIds.includes(change.id) && !invalid.has(change.id));
    const text = applyResumeChanges([...(block.heading ? [block.heading] : []), ...block.lines].join("\n"), selected).text;
    const lines = text.split("\n");
    return { ...block, heading: block.heading ? lines.shift() || block.heading : null, lines };
  });
}
