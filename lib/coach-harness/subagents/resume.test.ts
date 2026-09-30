import {
  asResumeFact,
  checkGrounding,
  RESUME_FAILURE_COPY,
  runResumeAgent,
  type BlockRewriter,
  type ConfirmedResumeFact,
  type ResumeInput,
} from "./resume";
import { TranscriptInputError, mainPromptPayloadFor, type BudgetSpec } from "./contract";
import type { CareerClaim } from "@/lib/coach-harness/types";

const budget: BudgetSpec = { maxSourceCalls: 4, maxTokens: 800, maxWallClockMs: 30_000, idempotencyKey: `rs-${Math.random()}` };

function claim(over: Partial<CareerClaim> & Pick<CareerClaim, "id">): CareerClaim {
  return {
    entityType: "project",
    entityKey: over.id,
    claimType: "experience",
    value: null,
    displayText: "我主导了数据看板的口径统一",
    status: "confirmed",
    visibility: "private",
    sourceKind: "user_statement",
    verificationLevel: "user_confirmed",
    sourceExcerpt: "口径统一是我牵头做的",
    ...over,
  };
}

const confirmedFact: ConfirmedResumeFact = {
  claimId: "cl1",
  status: "confirmed",
  verificationLevel: "user_confirmed",
  text: "我主导了数据看板的口径统一",
  source: { kind: "user_material", sourceKind: "user_statement", refId: "cl1" },
};

const blocks = [
  {
    blockId: "b1",
    heading: "项目经历",
    bullets: ["在字节参与内部数据看板建设，负责埋点与报表。", "口径统一是我牵头做的，跨 5 个团队。"],
  },
];

function makeInput(over: Partial<ResumeInput> = {}): ResumeInput {
  return {
    targetJd: { roleTitle: "数据产品经理", requiredSkills: ["指标体系", "SQL"] },
    confirmedFacts: [confirmedFact],
    currentBlocks: blocks,
    budget: { ...budget, idempotencyKey: `run-${Math.random()}` },
    ...over,
  };
}

describe("FR-22 简历输入：只吃已确认事实", () => {
  it("asResumeFact：非 confirmed / 非 user_confirmed 一律拒收", () => {
    expect(asResumeFact(claim({ id: "c2", status: "unverified" }))).toBeNull();
    expect(asResumeFact(claim({ id: "c3", verificationLevel: "self_reported" }))).toBeNull();
    expect(asResumeFact(claim({ id: "c4", status: "conflicted" }))).toBeNull();
    const ok = asResumeFact(claim({ id: "cl1" }));
    expect(ok?.claimId).toBe("cl1");
    expect(ok?.verificationLevel).toBe("user_confirmed");
  });

  it("类型层：宽 CareerClaim（status 是联合）不能塞进简历输入", () => {
    const wide = claim({ id: "cl1" });
    // @ts-expect-error status/verificationLevel 是窄字面量类型，未确认事实在类型上就进不来
    const facts: ConfirmedResumeFact[] = [wide];
    expect(facts).toHaveLength(1);
  });

  it("整段对话灌入 → 运行时拒绝", async () => {
    const duck = { ...makeInput(), conversation: [{ role: "user", content: "改简历的全过程" }] } as unknown as ResumeInput;
    await expect(runResumeAgent(duck, { rewriter: { rewriteBlock: async () => [] } })).rejects.toThrow(TranscriptInputError);
  });
});

describe("每句带出处；核验不过的句子直接丢弃", () => {
  const rewriter: BlockRewriter = {
    rewriteBlock: async () => [
      { text: "主导数据看板口径统一（跨 5 团队）", provenance: { kind: "confirmed_fact", claimId: "cl1" } },
      { text: "负责埋点与报表", provenance: { kind: "resume_text", blockId: "b1", quote: " 负责埋点与报表。 " } },
      { text: "虚构：设计了推荐算法", provenance: { kind: "confirmed_fact", claimId: "不存在" } },
      { text: "虚构：上线了北极星指标", provenance: { kind: "resume_text", blockId: "b1", quote: "北极星指标" } },
      { text: "无出处句子", provenance: null },
    ],
  };

  it("2 句可回指进建议，3 句被扣下并记录丢弃原因", async () => {
    const outcome = await runResumeAgent(makeInput(), { rewriter });
    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    expect(outcome.product.suggestions).toHaveLength(1);
    expect(outcome.product.suggestions[0].sentences.map((s) => s.text)).toEqual([
      "主导数据看板口径统一（跨 5 团队）",
      "负责埋点与报表",
    ]);
    expect(outcome.product.dropped.map((d) => d.dropReason)).toEqual(["unknown_claim", "quote_not_substring", "missing_provenance"]);
  });

  it("checkGrounding 可单独复用（槽3 核验的输入形状）", () => {
    const input = makeInput();
    expect(
      checkGrounding({ text: "x", provenance: { kind: "resume_text", blockId: "b1", quote: "参与内部数据看板建设" } }, input).ok,
    ).toBe(true);
  });

  it("改写引擎中途坏掉 → failed：已产出的块不外流，话术明确", async () => {
    const flaky: BlockRewriter = {
      rewriteBlock: async ({ block }) => {
        if (block.blockId === "b2") throw new Error("引擎断开");
        return [{ text: "主导数据看板口径统一", provenance: { kind: "confirmed_fact", claimId: "cl1" } }];
      },
    };
    const outcome = await runResumeAgent(
      makeInput({ currentBlocks: [...blocks, { blockId: "b2", heading: "技能", bullets: ["SQL"] }] }),
      { rewriter: flaky },
    );
    if (outcome.status !== "failed") throw new Error("应为 failed");
    expect("product" in outcome).toBe(false);
    expect(outcome.failure.partialWithheld).toBe(true);
    expect(outcome.failure.userCopy).toBe(RESUME_FAILURE_COPY);
    expect(mainPromptPayloadFor(outcome)).toEqual({ ok: false, userCopy: RESUME_FAILURE_COPY });
  });

  it("单块超 token 预算：整块扣下，不产出半截建议", async () => {
    const verbose: BlockRewriter = {
      rewriteBlock: async () => [{ text: "很长的改写".repeat(200), provenance: { kind: "confirmed_fact", claimId: "cl1" } }],
    };
    const outcome = await runResumeAgent(makeInput({ budget: { ...budget, maxTokens: 50, idempotencyKey: `tight-${Math.random()}` } }), {
      rewriter: verbose,
    });
    if (outcome.status !== "ok") throw new Error("unexpected");
    expect(outcome.product.suggestions).toHaveLength(0);
    expect(outcome.product.dropped).toHaveLength(1);
  });
});
