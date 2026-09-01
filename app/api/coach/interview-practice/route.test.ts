import { POST } from "./route";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { getDbClient } from "@/lib/db";
import { createOpportunitySnapshot } from "@/lib/coach-harness/repository";
import { evaluateQuickPractice } from "@/lib/interview/practice";

jest.mock("@/lib/auth");
jest.mock("@/lib/db");
jest.mock("@/lib/coach-harness/repository");
jest.mock("@/lib/interview/practice");

function chain(final: Record<string, unknown>) {
  const query: Record<string, jest.Mock> = {};
  for (const method of ["select", "eq", "contains"]) query[method] = jest.fn(() => query);
  query.maybeSingle = jest.fn(async () => final);
  query.gte = jest.fn(async () => final);
  return query;
}

describe("coach interview practice POST", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({ id: "user-1" });
    const opportunityQuery = chain({ data: { id: "opportunity-1" }, error: null });
    const countQuery = chain({ count: 0, error: null });
    (getDbClient as jest.Mock).mockResolvedValue({
      from: jest.fn((table: string) => table === "coach_opportunities" ? opportunityQuery : countQuery),
    });
    (createOpportunitySnapshot as jest.Mock).mockResolvedValue({ id: "snapshot-1" });
    (evaluateQuickPractice as jest.Mock).mockResolvedValue({
      verdict: "证据不足",
      summary: "缺少个人动作。",
      strengths: ["方向相关"],
      gaps: ["缺动作"],
      followUp: "你做了什么？",
      improvedOutline: ["结论", "动作", "结果"],
    });
  });

  test("analyzes and stores the answer in the opportunity history", async () => {
    const response = await POST(new Request("http://localhost/api/coach/interview-practice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opportunityId: "opportunity-1", question: "如何评测？", answer: "我做了抽检", jobDescription: "负责评测", resumeText: "搭建过评测流程" }),
    }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.record).toEqual(expect.objectContaining({ id: "snapshot-1", verdict: "证据不足" }));
    expect(createOpportunitySnapshot).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1", opportunityId: "opportunity-1", snapshotType: "interview_feedback",
      metadata: expect.objectContaining({ mode: "quick_practice" }),
    }));
  });

  test("still stores the raw answer when analysis fails", async () => {
    (evaluateQuickPractice as jest.Mock).mockRejectedValue(new Error("provider down"));
    const response = await POST(new Request("http://localhost/api/coach/interview-practice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opportunityId: "opportunity-1", question: "如何评测？", answer: "我做了抽检" }),
    }));
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ saved: true }));
    expect(createOpportunitySnapshot).toHaveBeenCalledWith(expect.objectContaining({ createdBy: "system" }));
  });
});
