import { POST } from "./route";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { callLLM } from "@/lib/llm";
import { finalizeQuota, reserveQuota } from "@/lib/quota";
import { createArtifactWithClaims, getContextBundleForUser } from "@/lib/coach-harness/repository";

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
});
