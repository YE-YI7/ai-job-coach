import { resumeMotionKeys, resumeMoveTarget } from "./resume-motion";
import { splitResumeBlocks } from "@/lib/opportunities/resume-blocks";

describe("resume interaction continuity", () => {
  const blocks = splitResumeBlocks("## 项目经历\n\n**知识助手**\n设计评测。\n\n**数据工作台**\n核对来源。");
  it("identifies content independently of parser positions", () => {
    const before = resumeMotionKeys(blocks);
    const after = resumeMotionKeys([...blocks].reverse().map((block, index) => ({ ...block, id: `project-${index}` })));
    expect(after).toEqual([...before].reverse());
  });
  it("keeps duplicate content distinct", () => {
    const keys = resumeMotionKeys([blocks[0], blocks[0]]);
    expect(keys[0]).not.toBe(keys[1]);
  });
  it("does not invent a move at either boundary", () => {
    expect(resumeMoveTarget(["a", "b"], 0, -1)).toBeNull();
    expect(resumeMoveTarget(["a", "b"], 1, 1)).toBeNull();
  });
  it("uses the neighbouring section for keyboard and touch moves", () => {
    expect(resumeMoveTarget(["a", "b", "c"], 1, -1)).toBe("a");
    expect(resumeMoveTarget(["a", "b", "c"], 1, 1)).toBe("c");
  });
});
