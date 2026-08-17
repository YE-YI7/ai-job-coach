import { POST } from "./route";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { createCockpitOpportunity } from "@/lib/coach-harness/repository";
import type { Opportunity } from "@/lib/opportunities/types";

jest.mock("@/lib/auth");
jest.mock("@/lib/coach-harness/repository");

function opportunity(overrides: Partial<Omit<Opportunity, "id">> = {}): Omit<Opportunity, "id"> {
  return {
    workspaceType: "job",
    company: "示例公司",
    role: "AI 产品经理",
    location: "上海",
    stage: "evaluating",
    stageLabel: "评估中",
    priority: "medium",
    sourceLabel: "网页材料导入",
    capturedAtLabel: "刚刚",
    jdText: "负责 AI 产品规划和评测闭环",
    resumeText: "负责过一个真实的 AI 项目",
    nextEventLabel: "今天完成投递判断",
    recommendation: "prepare_then_apply",
    recommendationLabel: "补充后投递",
    recommendationReason: "需要补充证据。",
    evidenceCoverage: { strong: 0, weak: 1, missing: 0, unverified: 0 },
    requirements: [],
    actions: [],
    activities: [],
    resumeChanges: [],
    interviewFocus: [],
    ...overrides,
  };
}

describe("coach opportunities POST", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({ id: "user-1", email: "user@example.com" });
    (createCockpitOpportunity as jest.Mock).mockImplementation(async (_userId, input) => ({ ...input, id: "opportunity-1" }));
  });

  test("persists a preparation workspace without requiring a JD", async () => {
    const input = opportunity({
      workspaceType: "preparation",
      company: "求职准备",
      role: "目标待确认",
      jdText: "",
      resumeText: "产品实习：负责需求分析和上线复盘",
      profileText: "我想找产品经理工作",
    });
    const response = await POST(new Request("http://localhost/api/coach/opportunities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opportunity: input }),
    }));

    expect(response.status).toBe(201);
    expect(createCockpitOpportunity).toHaveBeenCalledWith("user-1", expect.objectContaining({
      workspaceType: "preparation",
      jdText: "",
      resumeText: expect.stringContaining("产品实习"),
    }));
  });

  test("still rejects a job workspace without a JD", async () => {
    const response = await POST(new Request("http://localhost/api/coach/opportunities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opportunity: opportunity({ jdText: "" }) }),
    }));

    expect(response.status).toBe(400);
    expect(createCockpitOpportunity).not.toHaveBeenCalled();
  });
});
