import { isTrivialRewrite } from "./resume-diff";

describe("useful factual restructuring", () => {
  it("allows a dense factual paragraph to become readable bullets", () => {
    expect(isTrivialRewrite("负责客户咨询，记录退款问题。整理问题清单，交给主管处理。", "- 负责客户咨询，记录退款问题。\n- 整理问题清单，交给主管处理。")).toBe(false);
  });
  it("still rejects whitespace-only changes and existing bullet reformatting", () => {
    expect(isTrivialRewrite("负责客户咨询", "负责 客户咨询")).toBe(true);
    expect(isTrivialRewrite("- 客户咨询。\n- 退款登记。", "- 客户咨询。\n\n- 退款登记。")).toBe(true);
  });
});
