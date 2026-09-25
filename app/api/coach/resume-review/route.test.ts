import { POST } from "./route";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { callLLM } from "@/lib/llm";
import { validateArtifactDraft } from "@/lib/coach-harness";
import { createArtifactWithClaims, getContextBundleForUser, recordArtifactReview } from "@/lib/coach-harness/repository";

jest.mock("@/lib/auth");
jest.mock("@/lib/llm");
jest.mock("@/lib/generation-context", () => ({ runWithGenerationContext: (_: unknown, run: () => unknown) => run() }));
jest.mock("@/lib/tokenpay-recovery", () => ({ tokenPayRecoveryResponse: () => null }));
jest.mock("@/lib/coach-harness/repository", () => ({ createArtifactWithClaims: jest.fn(), getContextBundleForUser: jest.fn(), recordArtifactReview: jest.fn() }));
jest.mock("@/lib/coach-harness", () => ({
  ...jest.requireActual("@/lib/coach-harness/application-quality"),
  ContextBudgetExceededError: class extends Error {}, assertContextFits: jest.fn(), validateArtifactDraft: jest.fn(),
}));
const request = (changes: unknown[]) => new Request("http://localhost/api/coach/resume-review", { method: "POST", body: JSON.stringify({ opportunityId: "job", resumeText: "负责产品需求分析与上线复盘", jobDescription: "产品经理", changes }) });
const change = { id: "change-1", section: "经历", before: "负责产品需求分析与上线复盘", after: "完成产品上线复盘", status: "accepted", evidenceIds: ["claim-1"] };
beforeEach(() => {
  jest.resetAllMocks();
  (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({ id: "user" });
  (getContextBundleForUser as jest.Mock).mockResolvedValue({ allowedClaimIds: ["claim-1"], unverifiedClaimIds: [], selection: { included: [] }, claims: [], fingerprint: "test" });
  (validateArtifactDraft as jest.Mock).mockReturnValue({ ok: true, issues: [] });
  (createArtifactWithClaims as jest.Mock).mockResolvedValue({ id: "artifact", version: 1 });
  (recordArtifactReview as jest.Mock).mockImplementation(async (input) => ({ reviewer_type: input.reviewerType, status: input.status, summary: input.summary, findings: input.findings }));
  (callLLM as jest.Mock).mockResolvedValue(JSON.stringify({ status: "passed", summary: "通过", findings: [] }));
});
test("all-original succeeds without spending a model call or claiming independent verification", async () => {
  const response = await POST(request([{ ...change, status: "rejected" }]));
  const body = await response.json();
  expect(response.status).toBe(200);
  expect(body.applicationQuality.status).toBe("ready");
  expect(body.previewText).toBe(change.before);
  expect(callLLM).not.toHaveBeenCalled();
  expect(body.applicationQuality.reviews.find((review: { reviewerType: string }) => review.reviewerType === "independent_ai").status).toBe("not_run");
});
test("unlocatable source returns actionable changeId and skips independent review", async () => {
  const body = await (await POST(request([{ ...change, before: "不存在的原文" }]))).json();
  expect(body.applicationQuality.status).toBe("blocked");
  expect(body.applicationQuality.reviews[0].findings[0]).toMatchObject({ changeId: "change-1", code: "replacement_missed" });
  expect(callLLM).not.toHaveBeenCalled();
});
test("unsupported numeric facts still block, with original change id", async () => {
  (validateArtifactDraft as jest.Mock).mockReturnValue({ ok: false, issues: [{ path: "changes.0.after", code: "unsupported_number", severity: "error", message: "数字缺少证据" }] });
  const body = await (await POST(request([change]))).json();
  expect(body.applicationQuality.status).toBe("blocked");
  expect(body.applicationQuality.reviews[0].findings[0].changeId).toBe("change-1");
  expect(callLLM).not.toHaveBeenCalled();
});
