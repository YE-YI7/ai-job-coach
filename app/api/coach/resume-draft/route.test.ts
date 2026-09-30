import { POST } from "./route";
import { isTrivialRewrite } from "@/lib/coach-harness/resume-diff";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { callLLM } from "@/lib/llm";
import { finalizeQuota, reserveQuota } from "@/lib/quota";
import { applyResumeChanges, reviewAtsText } from "@/lib/coach-harness";
import { createArtifactWithClaims, getContextBundleForUser, recordArtifactReview } from "@/lib/coach-harness/repository";

jest.mock("@/lib/auth");
jest.mock("@/lib/llm");
jest.mock("@/lib/quota");
jest.mock("@/lib/generation-context", () => ({ runWithGenerationContext: (_context: unknown, run: () => unknown) => run() }));
jest.mock("@/lib/tokenpay-recovery", () => ({ tokenPayRecoveryResponse: () => null }));
jest.mock("@/lib/coach-harness/repository", () => ({
  createArtifactWithClaims: jest.fn(),
  getContextBundleForUser: jest.fn(),
  recordArtifactReview: jest.fn(),
}));
jest.mock("@/lib/coach-harness", () => ({
  ContextBudgetExceededError: class extends Error { blocked: unknown[] = []; },
  applyResumeChanges: jest.fn(),
  assertContextFits: jest.fn(),
  compileContextBundle: jest.fn(),
  renderCitableFactsForPrompt: jest.fn(() => ({ text: "[claim-1] 负责模型评测", usedTokens: 20, warnings: [] })),
  reviewAtsText: jest.fn(),
  validateArtifactDraft: jest.fn(() => ({ ok: true, issues: [] })),
}));

describe("resume draft source mapping", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({ id: "user-1" });
    (reserveQuota as jest.Mock).mockResolvedValue({ source: "free", remaining: 0 });
    (finalizeQuota as jest.Mock).mockResolvedValue(undefined);
    (getContextBundleForUser as jest.Mock).mockResolvedValue({
      allowedClaimIds: ["claim-1"], unverifiedClaimIds: [], selection: { included: [], excluded: [] },
      budget: { maxInputTokens: 12_000 }, usage: { truncated: false }, claims: [], artifacts: [], knowledge: [], attachments: [],
    });
  });

  afterEach(() => jest.restoreAllMocks());

  test("rejects suggestions whose before is a section label instead of exact resume text", async () => {
    (callLLM as jest.Mock).mockResolvedValue(JSON.stringify({ changes: [{
      section: "项目经历", before: "项目经历 > AI Job Coach", after: "主导 AI Job Coach", reason: "岗位匹配", sourceIds: ["claim-1"],
    }] }));
    const response = await POST(new Request("http://localhost/api/coach/resume-draft", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opportunityId: "opp-1", resumeText: "AI Job Coach：负责模型评测", jobDescription: "负责 AI 产品评测" }),
    }));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ ok: false, error: expect.stringContaining("没有生成通过事实校验") }));
    expect(createArtifactWithClaims).not.toHaveBeenCalled();
    expect(finalizeQuota).toHaveBeenCalledWith(expect.anything(), false);
    expect(getContextBundleForUser).toHaveBeenCalledWith(expect.objectContaining({
      opportunityId: "opp-1",
      questionSource: { id: "base-resume", text: "AI Job Coach：负责模型评测" },
    }));
  });

  test("rejects suggestions whose after ends with a dangling tail (半截话)", async () => {
    (callLLM as jest.Mock).mockResolvedValue(JSON.stringify({ changes: [{
      section: "项目经历", before: "负责模型评测", after: "负责模型评测，覆盖准确率、", reason: "岗位匹配", sourceIds: ["claim-1"],
    }] }));
    const response = await POST(new Request("http://localhost/api/coach/resume-draft", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opportunityId: "opp-1", resumeText: "AI Job Coach：负责模型评测", jobDescription: "负责 AI 产品评测" }),
    }));

    expect(response.status).toBe(422);
    expect(finalizeQuota).toHaveBeenCalledWith(expect.anything(), false);
  });

  test("引用回指守卫把残缺与夸大动作的建议确定性拦下，不再为它们花一次质检调用", async () => {
    (callLLM as jest.Mock).mockResolvedValue(JSON.stringify({ changes: [
      { section: "项目经历", before: "AI Job Coach：负责模型评测", after: "AI Job Coach 约30用户，腾活约10，已上线腾", reason: "量化", sourceIds: ["claim-1"] },
      { section: "项目经历", before: "负责模型评测", after: "主导模型评测全流程", reason: "岗位匹配", sourceIds: ["claim-1"] },
    ] }));
    const response = await POST(new Request("http://localhost/api/coach/resume-draft", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opportunityId: "opp-1", resumeText: "AI Job Coach：负责模型评测", jobDescription: "负责 AI 产品评测" }),
    }));

    expect(response.status).toBe(422);
    // 「已上线」在来源里没有逐字依据、「主导」把职责写大了——两类都是 R-3 点名的形状，
    // 守卫给 block；起草那次调用之后就不该再花付费质检（callLLM 只跑 1 次）。
    expect(callLLM).toHaveBeenCalledTimes(1);
    expect(finalizeQuota).toHaveBeenCalledWith(expect.anything(), false);
  });

  test("reviewer error finding on a real changeId removes that suggestion only", async () => {
    // 两条都是「换措辞」类：守卫只给 annotate（见 spec §10 的两档裁定），所以都能进质检。
    // 语义上的扩大（凭空加「幻觉率」口径）只有质检员看得出来，由它摘掉那一条。
    const overClaim = { section: "项目经历", before: "负责模型评测", after: "独立完成模型评测方案，覆盖准确率与幻觉率两个口径", reason: "量化", sourceIds: ["claim-1"] };
    const reworded = { section: "项目经历", before: "AI Job Coach：负责模型评测", after: "模型评测覆盖准确率口径", reason: "岗位匹配", sourceIds: ["claim-1"] };
    (callLLM as jest.Mock)
      .mockResolvedValueOnce(JSON.stringify({ changes: [overClaim, reworded] }))
      .mockImplementationOnce(async (messages: { role: string; content: string }[]) => {
        // 质检 prompt 末尾带「待审修改」JSON，从中取服务端真实生成的 changeId，
        // 只对凭空加口径那条回 error。
        const prompt = messages[messages.length - 1].content;
        const list = JSON.parse(prompt.slice(prompt.indexOf("[", prompt.indexOf("待审修改")))) as { id: string; after: string }[];
        const badId = list.find((c) => c.after.includes("幻觉率"))?.id;
        return JSON.stringify({ status: "failed", summary: "一条凭空加了口径", findings: [{ changeId: badId, severity: "error", message: "来源里没有幻觉率口径" }] });
      });
    (applyResumeChanges as jest.Mock).mockImplementation((_text: string, changes: unknown[]) => ({ text: `preview:${(changes as { after: string }[]).length}`, findings: [] }));
    (reviewAtsText as jest.Mock).mockReturnValue({ ok: true, coverage: 1, findings: [] });
    (createArtifactWithClaims as jest.Mock).mockResolvedValue({ id: "art-1", version: 1 });
    (recordArtifactReview as jest.Mock).mockResolvedValue({ reviewer_type: "facts", summary: "ok", findings: [] });

    const response = await POST(new Request("http://localhost/api/coach/resume-draft", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opportunityId: "opp-1", resumeText: "AI Job Coach：负责模型评测", jobDescription: "负责 AI 产品评测" }),
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.changes).toHaveLength(1);
    expect(body.changes[0].after).toContain("准确率口径");
    expect(body.rejectedCount).toBe(1);
    // 台账记下两条都被核验过、都只判 annotate：拦截的是质检员，不是守卫。
    expect(body.guards).toEqual([
      expect.objectContaining({ index: 0, outcome: "annotate", code: "citation_no_exact_substring" }),
      expect.objectContaining({ index: 1, outcome: "annotate", code: "citation_no_exact_substring" }),
    ]);
    // 下发给质检后仍保留的建议才进入 preview/artifact：宁缺毋滥但不误伤好建议。
    expect(applyResumeChanges).toHaveBeenCalledWith(expect.any(String), [expect.objectContaining({ after: expect.stringContaining("准确率口径") })]);
    expect(finalizeQuota).toHaveBeenCalledWith(expect.anything(), true);
  });
});

describe("isTrivialRewrite (同义换词不进确认列表)", () => {
  it("仅换一两个字的润色视为无信息增量", () => {
    expect(isTrivialRewrite("擅长把模糊需求拆成知识组织与评测流程", "擅长把模糊需求拆解为知识组织与评测流程")).toBe(true);
    expect(isTrivialRewrite("负责一个 AI 项目的产品落地", "负责一个AI项目的产品落地")).toBe(true);
  });
  it("带来结构或信息变化的改写不算 trivial", () => {
    expect(isTrivialRewrite(
      "做过模型评测工作",
      "独立完成 3 个 LLM 场景的评测方案设计，覆盖准确率与幻觉率，评测周期从 2 周压缩到 3 天",
    )).toBe(false);
  });
});
