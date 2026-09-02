import type { Opportunity } from "./types";

export function applyUserResumeEdit(
  opportunity: Opportunity,
  changeId: string,
  after: string,
  now = Date.now(),
): Opportunity {
  const nextText = after.trim().slice(0, 2_000);
  if (!nextText) return opportunity;

  return {
    ...opportunity,
    resumeChanges: opportunity.resumeChanges.map((change) => change.id === changeId ? {
      ...change,
      after: nextText,
      editedByUser: true,
      status: "pending" as const,
    } : change),
    applicationQuality: opportunity.applicationQuality ? {
      ...opportunity.applicationQuality,
      status: "draft" as const,
      reviews: opportunity.applicationQuality.reviews.map((review) => review.reviewerType === "pdf" ? review : {
        ...review,
        status: "not_run" as const,
        summary: "用户修改后需要重新检查。",
      }),
    } : {
      artifactId: `user-edit-${opportunity.id}`,
      version: 0,
      status: "draft" as const,
      reviews: [
        { reviewerType: "facts" as const, status: "not_run" as const, summary: "用户修改后需要重新检查。" },
        { reviewerType: "independent_ai" as const, status: "not_run" as const, summary: "用户修改后需要重新检查。" },
        { reviewerType: "ats" as const, status: "not_run" as const, summary: "用户修改后需要重新检查。" },
        { reviewerType: "pdf" as const, status: "not_run" as const, summary: "冻结版本后再校验 PDF。" },
      ],
    },
    activities: [{
      id: `${opportunity.id}-resume-edit-${now}`,
      actor: "user" as const,
      title: "手动调整简历建议",
      detail: "修改已保存；冻结前需要重新检查事实和岗位匹配。",
      timeLabel: "刚刚",
    }, ...opportunity.activities],
  };
}
