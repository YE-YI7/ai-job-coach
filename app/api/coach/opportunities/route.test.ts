import { POST, PATCH } from "./route";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { createCockpitOpportunity, listCockpitOpportunities, recordTierIntentFromText, updateCockpitOpportunity, updateCockpitOpportunityStage } from "@/lib/coach-harness/repository";
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
    (listCockpitOpportunities as jest.Mock).mockResolvedValue([]);
  });
  test("lost-response retry returns the same saved opportunity from the current user only", async () => {
    const intakeRequestId="da4b86f7-c4e1-4cb1-93ad-bdfb84cce555";
    const saved={...opportunity(),id:"existing",intakeRequestId};
    (listCockpitOpportunities as jest.Mock).mockResolvedValue([saved]);
    const response=await POST(new Request("https://example.com",{method:"POST",body:JSON.stringify({opportunity:opportunity(),intakeRequestId})}));
    expect(await response.json()).toMatchObject({ok:true,replay:true,opportunity:{id:"existing"}});
    expect(listCockpitOpportunities).toHaveBeenCalledWith("user-1");
    expect(createCockpitOpportunity).not.toHaveBeenCalled();
  });
  test("new intake saves its correlation ID; invalid IDs cannot invoke repository writes", async () => {
    const intakeRequestId="da4b86f7-c4e1-4cb1-93ad-bdfb84cce555";
    await POST(new Request("https://example.com",{method:"POST",body:JSON.stringify({opportunity:opportunity(),intakeRequestId})}));
    expect(createCockpitOpportunity).toHaveBeenCalledWith("user-1",expect.objectContaining({intakeRequestId}));
    jest.clearAllMocks();
    const response=await POST(new Request("https://example.com",{method:"POST",body:JSON.stringify({opportunity:opportunity(),intakeRequestId:"bad"})}));
    expect(response.status).toBe(400);expect(createCockpitOpportunity).not.toHaveBeenCalled();
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

  test("存岗位时接住方向里那句档位意向，且只读方向不读 JD 正文", async () => {
    (recordTierIntentFromText as jest.Mock).mockResolvedValue(null);
    const response = await POST(new Request("http://localhost/api/coach/opportunities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opportunity: opportunity({ role: "目标：大厂产品经理", jdText: "我们是快速成长的创业公司，负责……" }) }),
    }));

    expect(response.status).toBe(201);
    expect(recordTierIntentFromText).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1", text: "目标：大厂产品经理", opportunityId: "opportunity-1",
    }));
    // 用人方自述的「创业公司」不能当成用户的档位意向
    expect(JSON.stringify((recordTierIntentFromText as jest.Mock).mock.calls)).not.toMatch(/创业公司/);
  });

  test("档位意向没接住也照样算保存成功，不能反过来报存失败", async () => {
    (recordTierIntentFromText as jest.Mock).mockRejectedValue(Error("db down"));
    const response = await POST(new Request("http://localhost/api/coach/opportunities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opportunity: opportunity({ role: "目标：大厂产品经理" }) }),
    }));
    expect(response.status).toBe(201);
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
test("改方向时同样接住档位意向，失败不报存失败", async () => {
  (recordTierIntentFromText as jest.Mock).mockResolvedValue(null);
  expect((await PATCH(request({ opportunity: { id, company: "公司", role: "只想进创业公司" } }))).status).toBe(200);
  expect(recordTierIntentFromText).toHaveBeenCalledWith(expect.objectContaining({ userId: "owner", text: "只想进创业公司", opportunityId: id }));
  (recordTierIntentFromText as jest.Mock).mockRejectedValue(Error("db down"));
  expect((await PATCH(request({ opportunity: { id, company: "公司", role: "只想进创业公司" } }))).status).toBe(200);
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
