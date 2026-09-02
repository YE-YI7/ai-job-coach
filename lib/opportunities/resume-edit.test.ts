import { applyUserResumeEdit } from "./resume-edit";
import type { Opportunity } from "./types";

function opportunity(): Opportunity {
  return {
    id: "job-1",
    company: "示例公司",
    role: "AI 产品经理",
    location: "上海",
    stage: "evaluating",
    stageLabel: "评估中",
    priority: "high",
    sourceLabel: "用户材料",
    capturedAtLabel: "刚刚",
    nextEventLabel: null,
    recommendation: "prepare_then_apply",
    recommendationLabel: "补充后投递",
    recommendationReason: "需要补充证据",
    evidenceCoverage: { strong: 0, weak: 0, missing: 1, unverified: 0 },
    requirements: [],
    actions: [],
    activities: [],
    interviewFocus: [],
    resumeChanges: [{
      id: "change-1",
      section: "项目经历",
      before: "负责 AI 功能",
      after: "主导 AI 功能设计",
      reason: "明确职责",
      evidenceId: "claim-1",
      status: "accepted",
    }],
  };
}

describe("applyUserResumeEdit", () => {
  test("lets the user revise an accepted AI suggestion and requires revalidation", () => {
    const result = applyUserResumeEdit(opportunity(), "change-1", "  设计评测方案并复盘 badcase  ", 100);

    expect(result.resumeChanges[0]).toMatchObject({
      after: "设计评测方案并复盘 badcase",
      editedByUser: true,
      status: "pending",
    });
    expect(result.applicationQuality?.status).toBe("draft");
    expect(result.applicationQuality?.reviews.find((review) => review.reviewerType === "facts")?.status).toBe("not_run");
  });

  test("supports editing the same suggestion again without losing the latest text", () => {
    const first = applyUserResumeEdit(opportunity(), "change-1", "第一版", 100);
    const second = applyUserResumeEdit(first, "change-1", "第二版", 200);

    expect(second.resumeChanges[0].after).toBe("第二版");
    expect(second.activities).toHaveLength(2);
  });
});
