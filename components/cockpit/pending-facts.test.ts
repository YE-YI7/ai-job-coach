import {factActionFailureText, factReviewRequest, pendingFactsFromResponse} from "./pending-facts";

const claim = (over: Record<string, unknown>) => ({
  id: "c1", entityType: "experience", displayText: "负责过日活百万级推荐系统的召回模块", status: "unverified", updatedAt: "2026-09-30T08:00:00Z", ...over,
});

describe("pendingFactsFromResponse", () => {
  test("只留 unverified 的候选事实，confirmed 不进队列", () => {
    const facts = pendingFactsFromResponse({claims: [claim({}), claim({id: "c2", status: "confirmed"})]});
    expect(facts.map((f) => f.id)).toEqual(["c1"]);
  });
  test("同样文案去重，只留第一条", () => {
    const facts = pendingFactsFromResponse({claims: [claim({}), claim({id: "dup", displayText: "负责过日活百万级推荐系统的召回模块"})]});
    expect(facts).toHaveLength(1);
  });
  test("迁移继承的确认状态要在队列里看得见", () => {
    const facts = pendingFactsFromResponse({claims: [claim({migratedFrom: "old-migration"})]});
    expect(facts[0].inherited).toBe(true);
  });
  test("缺 id 或缺文案的行直接丢弃，不补假数据", () => {
    expect(pendingFactsFromResponse({claims: [claim({id: ""}), claim({displayText: "  "}), "junk", null]})).toEqual([]);
  });
  test("响应整体不可信时返回空队列", () => {
    expect(pendingFactsFromResponse(null)).toEqual([]);
    expect(pendingFactsFromResponse({error: "事实库读取失败"})).toEqual([]);
  });
});

describe("核对动作", () => {
  test("确认与撤回都发往 PATCH /api/coach/claims（#61 已挂载）", () => {
    expect(factReviewRequest("c1", "confirm")).toEqual({method: "PATCH", path: "/api/coach/claims", body: {claimId: "c1", action: "confirm"}});
    expect(factReviewRequest("c1", "withdraw").body.action).toBe("withdraw");
  });
  test("动作失败时如实说明，不假装保存成功；405 与 404 分开说", () => {
    expect(factActionFailureText(405)).toContain("PATCH /api/coach/claims");
    expect(factActionFailureText(405)).toContain("不会进简历或档案");
    expect(factActionFailureText(404)).toContain("没有改动任何内容");
    expect(factActionFailureText(500)).toContain("原状态保留");
  });
});
