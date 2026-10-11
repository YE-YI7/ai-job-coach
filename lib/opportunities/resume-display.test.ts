import { selectedResumeBlocks } from "./resume-display";
import { assignChangesToBlocks, splitResumeBlocks } from "./resume-blocks";
import { applyResumeChanges } from "../coach-harness/application-quality";
import type { ResumeChange } from "./types";

const change = (before: string, after: string, status: ResumeChange["status"] = "accepted"): ResumeChange => ({ id: "edit", section: "项目", before, after, status, reason: "", evidenceId: null });
function display(source: string, changes: ResumeChange[]) {
  return selectedResumeBlocks(source, assignChangesToBlocks(splitResumeBlocks(source), changes), changes);
}
test("only accepted suggestions enter the paper, matching export", () => {
  const source = "## 项目\n- **负责**：需求验证和上线复盘。";
  expect(display(source, [change("需求验证", "真实需求验证", "pending")])[0].lines.join("\n")).toContain("需求验证");
  expect(display(source, [change("需求验证", "真实需求验证", "pending")])[0].lines.join("\n")).not.toContain("真实需求验证");
  const edit = change("**负责**：需求验证", "**负责**：真实需求验证");
  expect(display(source, [edit])[0].lines.join("\n")).toBe(applyResumeChanges(source, [edit]).text.split("\n").slice(1).join("\n"));
});
test("multi-line accepted edits render and ambiguous anchors retain the original", () => {
  const source = "## 项目\n负责需求验证\n与上线复盘";
  expect(display(source, [change("负责需求验证 与上线复盘", "推动需求验证与上线复盘")])[0].lines).toEqual(["推动需求验证与上线复盘"]);
  const repeated = "## 项目 A\n负责需求验证\n## 项目 B\n负责需求验证";
  const blocks = display(repeated, [change("负责需求验证", "新表述")]);
  expect(blocks.flatMap(block => block.lines)).not.toContain("新表述");
});
