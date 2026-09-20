import { POST, PATCH } from "./route";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { createCockpitOpportunity, updateCockpitOpportunity, updateCockpitOpportunityStage } from "@/lib/coach-harness/repository";
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

describe("stage PATCH", () => {
const id = "12345678-1234-4234-8234-123456789012";
const request = (body: unknown) => new Request("http://localhost/api/coach/opportunities", { method: "PATCH", body: JSON.stringify(body) });
beforeEach(() => {
  jest.resetAllMocks();
  (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({ id: "owner" });
});
test("确认阶段只保存指定用户岗位的阶段，不提交旧正文", async () => {
  expect((await PATCH(request({ stageUpdate: { id, stage: "won" } }))).status).toBe(200);
  expect(updateCockpitOpportunityStage).toHaveBeenCalledWith("owner", id, "won");
  expect(updateCockpitOpportunity).not.toHaveBeenCalled();
});
test("后台自动同步保留数据库阶段", async () => {
  const opportunity = { id, company: "公司", role: "PM", stage: "applied" };
  expect((await PATCH(request({ opportunity, preserveStage: true }))).status).toBe(200);
  expect(updateCockpitOpportunity).toHaveBeenCalledWith("owner", opportunity, true);
});
test("数据库失败不报告保存成功", async () => {
  (updateCockpitOpportunityStage as jest.Mock).mockRejectedValue(new Error("unavailable"));
  const response = await PATCH(request({ stageUpdate: { id, stage: "won" } }));
  expect(response.status).toBe(500);
  expect((await response.json()).ok).toBe(false);
});
test.each(["invalid", "__proto__"])("拒绝未知阶段 %s", async (stage) => {
  expect((await PATCH(request({ stageUpdate: { id, stage } }))).status).toBe(400);
  expect(updateCockpitOpportunityStage).not.toHaveBeenCalled();
});
test("未登录不能改阶段", async () => {
  (getCurrentUserFromRequest as jest.Mock).mockResolvedValue(null);
  expect((await PATCH(request({ stageUpdate: { id, stage: "won" } }))).status).toBe(401);
});

});
