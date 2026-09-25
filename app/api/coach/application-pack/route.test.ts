import { POST } from "./route";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { createArtifactWithClaims, createOpportunitySnapshot, getArtifactForUser, getContextBundleForUser, listArtifactReviews, recordArtifactReview } from "@/lib/coach-harness/repository";
jest.mock("@/lib/auth");
jest.mock("@/lib/coach-harness/repository", () => ({ createArtifactWithClaims: jest.fn(), createOpportunitySnapshot: jest.fn(), getArtifactForUser: jest.fn(), getContextBundleForUser: jest.fn(), listArtifactReviews: jest.fn(), recordArtifactReview: jest.fn() }));
jest.mock("@/lib/coach-harness", () => ({ ...jest.requireActual("@/lib/coach-harness/application-quality"), ContextBudgetExceededError: class extends Error {}, assertContextFits: jest.fn(), validateArtifactDraft: jest.fn(() => ({ ok: true, issues: [] })) }));
const change = { id: "one", before: "原始简历", after: "修改简历", status: "accepted", section: "经历", evidenceIds: ["claim"] };
const request = (changes = [change], resumeText = "原始简历") => new Request("http://localhost/api/coach/application-pack", { method: "POST", body: JSON.stringify({ opportunityId: "job", artifactId: "reviewed", resumeText, jobDescription: "岗位", changes }) });
beforeEach(() => {
  jest.clearAllMocks();
  (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({ id: "user" });
  (getArtifactForUser as jest.Mock).mockResolvedValue({ content: { baseResumeText: "原始简历", jobDescription: "岗位", previewText: "修改简历", changes: [change] } });
  (listArtifactReviews as jest.Mock).mockResolvedValue([{ reviewer_type: "independent_ai", status: "passed" }]);
  (getContextBundleForUser as jest.Mock).mockResolvedValue({ fingerprint: "f", usage: { usedTokens: 1 }, budget: { maxInputTokens: 12000 }, selection: { included: [], excluded: [] } });
  (createArtifactWithClaims as jest.Mock).mockResolvedValue({ id: "new", version: 2 });
  (createOpportunitySnapshot as jest.Mock).mockResolvedValue({ version: 1 });
});
test("saves the same reviewed text with owner-scoped lookup", async () => {
  expect((await POST(request())).status).toBe(200);
  expect(getArtifactForUser).toHaveBeenCalledWith("user", "job", "reviewed");
  expect(createOpportunitySnapshot).toHaveBeenCalled();
});
test("cannot reuse an old review after changing text", async () => {
  expect((await POST(request([{ ...change, after: "未经复核的新版本" }]))).status).toBe(409);
  expect(createOpportunitySnapshot).not.toHaveBeenCalled();
});
test("pending choices cannot be silently omitted", async () => {
  expect((await POST(request([{ ...change, status: "pending" }]))).status).toBe(400);
});
test("reviewed all-original may save without a fake independent pass", async () => {
  (listArtifactReviews as jest.Mock).mockResolvedValue([{ reviewer_type: "independent_ai", status: "not_run" }]);
  (getArtifactForUser as jest.Mock).mockResolvedValue({ content: { baseResumeText: "原始简历", jobDescription: "岗位", previewText: "原始简历", changes: [{ ...change, status: "rejected" }] } });
  const result = await POST(request([{ ...change, status: "rejected" }]));
  expect(result.status).toBe(200);
  expect(await result.json()).toMatchObject({ retainedOriginal: true, resumeText: "原始简历" });
  expect(recordArtifactReview).toHaveBeenCalledWith(expect.objectContaining({ reviewerType: "independent_ai", status: "not_run" }));
});
