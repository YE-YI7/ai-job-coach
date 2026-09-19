import { POST } from "./route";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { createCockpitOpportunity } from "@/lib/coach-harness/repository";

jest.mock("@/lib/auth");
jest.mock("@/lib/coach-harness/repository", () => ({
  createCockpitOpportunity: jest.fn(),
}));

const USER = "00000000-0000-4000-8000-000000000001";

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/offers/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const VALID_BODY = {
  company: "字节跳动",
  role: "产品经理 Offer 对比",
  offers: [
    { name: "字节跳动 PM", monthlySalary: 30000, monthsPaid: 15, yearEndBonusMode: "months", yearEndBonusValue: 2, socialInsuranceBase: 30000, housingFundRatePct: 12, signingFee: 50000, equityAnnualPreTax: 60000, weeklyHours: 50 },
    { name: "美团 PM", monthlySalary: 28000, monthsPaid: 14, weeklyHours: 45 },
  ],
  note: "更看重成长空间",
};

describe("POST /api/offers/save", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("未登录返回 401，不落库", async () => {
    (getCurrentUserFromRequest as jest.Mock).mockResolvedValue(null);
    const response = await POST(jsonRequest(VALID_BODY));
    expect(response.status).toBe(401);
    expect(createCockpitOpportunity).not.toHaveBeenCalled();
  });

  test("合法 2 个 offer → 200 { ok, id }，落库对象 workspaceType/stage/offerComparison 正确", async () => {
    (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({ id: USER });
    (createCockpitOpportunity as jest.Mock).mockResolvedValue({ id: "opp-1" });
    const response = await POST(jsonRequest(VALID_BODY));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, id: "opp-1" });
    expect(createCockpitOpportunity).toHaveBeenCalledTimes(1);
    const [userId, opportunity] = (createCockpitOpportunity as jest.Mock).mock.calls[0];
    expect(userId).toBe(USER);
    expect(opportunity.workspaceType).toBe("offer");
    expect(opportunity.stage).toBe("negotiating");
    expect(opportunity.stageLabel).toBe("Offer 决策");
    expect(opportunity.company).toBe("字节跳动");
    expect(opportunity.role).toBe("产品经理 Offer 对比");
    expect(opportunity.offerComparison.offers).toHaveLength(2);
    expect(opportunity.offerComparison.offers[0].computed.grossAnnualPackage).toBeGreaterThan(0);
    expect(typeof opportunity.offerComparison.computedAt).toBe("string");
    expect(opportunity.offerComparison.note).toBe("更看重成长空间");
  });

  test("超过 3 个 offer 返回 400", async () => {
    (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({ id: USER });
    const response = await POST(jsonRequest({
      offers: [
        { name: "A", monthlySalary: 1000, weeklyHours: 40 },
        { name: "B", monthlySalary: 1000, weeklyHours: 40 },
        { name: "C", monthlySalary: 1000, weeklyHours: 40 },
        { name: "D", monthlySalary: 1000, weeklyHours: 40 },
      ],
    }));
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("3");
    expect(createCockpitOpportunity).not.toHaveBeenCalled();
  });

  test("负数金额返回 400", async () => {
    (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({ id: USER });
    const response = await POST(jsonRequest({
      offers: [{ name: "A", monthlySalary: -100, weeklyHours: 40 }],
    }));
    expect(response.status).toBe(400);
    expect(createCockpitOpportunity).not.toHaveBeenCalled();
  });

  test("非法 JSON 返回 400", async () => {
    (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({ id: USER });
    const response = await POST(jsonRequest("{not-json"));
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid JSON");
  });

  test("落库异常返回 500 结构化错误", async () => {
    (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({ id: USER });
    (createCockpitOpportunity as jest.Mock).mockRejectedValue(new Error("db down"));
    const response = await POST(jsonRequest(VALID_BODY));
    const body = await response.json();
    expect(response.status).toBe(500);
    expect(body).toEqual({ ok: false, error: "保存 offer 对比失败" });
  });
});
