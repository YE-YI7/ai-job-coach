import {
  arbitrate,
  assertStructuredInput,
  mainPromptPayloadFor,
  promoteToFact,
  quoteWithinBudget,
  TranscriptInputError,
  type BudgetSpec,
  type RuleVerdict,
} from "./contract";
import type { RetrievalInput } from "./retrieval";

const budget: BudgetSpec = { maxSourceCalls: 4, maxTokens: 4800, maxWallClockMs: 6000, idempotencyKey: "k1" };

describe("assertStructuredInput：只收结构化字段", () => {
  it("正常结构化输入通过", () => {
    expect(() =>
      assertStructuredInput({
        keywords: ["产品经理", "B端"],
        hard: { location: "北京", yearsMin: 3 },
        profile: { city: "北京", yearsExperience: 5, education: "bachelor" },
        goal: { roleTitle: "产品经理", targetLocations: ["北京"] },
        budget,
      }),
    ).not.toThrow();
  });

  it("带 role+content 的消息数组被运行时拒绝", () => {
    const duck = { keywords: ["a"], messages: [{ role: "user", content: "整段对话" }] };
    expect(() => assertStructuredInput(duck)).toThrow(TranscriptInputError);
  });

  it("禁止字段名（transcript/history 等）被拒", () => {
    expect(() => assertStructuredInput({ chatHistory: "随便一段" })).toThrow(TranscriptInputError);
    expect(() => assertStructuredInput({ nested: { transcript: [] } })).toThrow(TranscriptInputError);
  });

  it("超长字符串 / 超大数组视为走私对话", () => {
    expect(() => assertStructuredInput({ text: "x".repeat(2001) })).toThrow(TranscriptInputError);
    expect(() => assertStructuredInput({ arr: new Array(65).fill("a") })).toThrow(TranscriptInputError);
  });

  it("类型层：检索输入的字面量里加 messages 字段编译不过（excess property）", () => {
    const okInput: RetrievalInput = { keywords: ["产品经理"], hard: {}, profile: {}, goal: { roleTitle: "PM", targetLocations: [] }, budget };
    // @ts-expect-error 输入是闭合接口：对话数组在类型上没有容身之处
    const badInput: RetrievalInput = { ...okInput, messages: [{ role: "user", content: "hi" }] };
    expect(badInput).toBeDefined();
  });
});

describe("失败语义：failed 分支结构上拿不到产物", () => {
  it("failed outcome 没有 product 键，主 prompt 只能拿到话术", () => {
    const failed = {
      status: "failed" as const,
      idempotencyKey: "k1",
      usage: { billingUnits: 1, sourceCalls: 0, tokens: 0, wallClockMs: 0, budget },
      failure: { reason: "source_error" as const, userCopy: "调研没跑成，先基于 JD 和你的简历辅导，结果我稍后补。", partialWithheld: true, detail: "x" },
    };
    expect("product" in failed).toBe(false);
    const payload = mainPromptPayloadFor(failed);
    expect(payload).toEqual({ ok: false, userCopy: failed.failure.userCopy });
  });

  it("degraded 是显式约定的降级产物，带话术注记", () => {
    const degraded = mainPromptPayloadFor({
      status: "degraded",
      idempotencyKey: "k1",
      usage: { billingUnits: 0, sourceCalls: 0, tokens: 0, wallClockMs: 0, budget },
      product: { kept: 3 },
      degradation: { what: "verification_source_error", userCopy: "核验没跑成，全部保留并标注未核验。" },
    });
    expect(degraded).toEqual({ ok: true, product: { kept: 3 }, note: "核验没跑成，全部保留并标注未核验。" });
  });
});

describe("判定不等于事实：提权必须带用户确认", () => {
  it("无确认凭证时提权返回 null", () => {
    expect(
      promoteToFact(
        { statement: "这家公司在做 B 端", source: { kind: "external", url: "https://x", fetchedAt: "2026-09-30", trust: "untrusted" }, currentLevel: "none" },
        undefined,
      ),
    ).toBeNull();
  });
  it("用户确认后得到 user_confirmed 事实", () => {
    const fact = promoteToFact(
      { statement: "这家公司在做 B 端", source: { kind: "external", url: "https://x", fetchedAt: "2026-09-30", trust: "untrusted" }, currentLevel: "none" },
      { confirmedByUser: true },
    );
    expect(fact?.verificationLevel).toBe("user_confirmed");
  });
});

describe("扇出事前报价", () => {
  it("报价超预算即判不过", () => {
    expect(quoteWithinBudget({ billingUnits: 1, plannedSourceCalls: 5, estimatedTokens: 100, estimatedWallClockMs: 100, rationale: "" }, budget)).toBe(false);
    expect(quoteWithinBudget({ billingUnits: 1, plannedSourceCalls: 4, estimatedTokens: 5000, estimatedWallClockMs: 100, rationale: "" }, budget)).toBe(false);
    expect(quoteWithinBudget({ billingUnits: 1, plannedSourceCalls: 4, estimatedTokens: 100, estimatedWallClockMs: 6100, rationale: "" }, budget)).toBe(false);
  });
});

describe("冲突仲裁：确定性规则层优先并留痕", () => {
  const rule: RuleVerdict = { dedupeKey: "jk_1", decision: "drop", ruleId: "company_tier_directory", basis: "层次不在目标内" };
  it("意见与规则不一致 → 规则赢 + 冲突记录", () => {
    const { decision, conflict } = arbitrate(rule, { dedupeKey: "jk_1", decision: "keep", matchedField: "keyword", reason: "检索说合适" }, "2026-09-30T00:00:00Z");
    expect(decision).toBe("drop");
    expect(conflict?.resolvedBy).toBe("deterministic_rule");
    expect(conflict?.observedAt).toBe("2026-09-30T00:00:00Z");
  });
  it("意见拿不准（unsure）→ 不算冲突", () => {
    const { decision, conflict } = arbitrate({ ...rule, decision: "keep" }, { dedupeKey: "jk_1", decision: "unsure", matchedField: "lookup_miss", reason: "名录查不到" }, "now");
    expect(decision).toBe("keep");
    expect(conflict).toBeNull();
  });
});
