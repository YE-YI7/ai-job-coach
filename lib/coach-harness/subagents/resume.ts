/**
 * 简历子 Agent（resume）。PRD FR-22 + 契约表第四行：
 * 输入 = 目标 JD + 已确认的档案事实 + 当前简历分块，**不吃整段对话**；
 * 输出 = 逐块改写建议，每句带出处（指向某条已确认事实或某段简历原文子串）；
 * 核验不过的句子直接丢弃，不写成建议（失败话术）。
 *
 * 「未确认事实不能当依据」不是运行时检查一句 prompt 约束，而是类型构造：
 * 输入只收 `ConfirmedResumeFact`（status/verificationLevel 都是字面量窄类型），
 * 宽类型 `CareerClaim`（status 为联合）不可赋给窄类型——传未确认事实直接编译报错；
 * 想从 CareerClaim 拿值只能过 `asResumeFact` 这道漏斗，未确认返回 null。
 *
 * 本包不做完整的幻觉回指核验（那是 W3 citation-verifier 的职责），
 * 只落契约要求的最小确定性闸门：claimId 必须真实存在、quote 必须是原文子串。
 * 改写引擎本身是注入接口，本轮不接模型。
 */
import {
  assertStructuredInput,
  createInMemoryIdempotencyStore,
  type BudgetSpec,
  type IdempotencyStore,
  type SourcePointer,
  type SubAgentOutcome,
} from "./contract";
import type { CareerClaim } from "@/lib/coach-harness/types";

/* --------------------------- 已确认事实的窄类型 --------------------------- */

export interface ConfirmedResumeFact {
  claimId: string;
  /** 只有逐条确认过的才算事实来源；user_upload 只表示「交过材料」。 */
  status: "confirmed";
  verificationLevel: "user_confirmed";
  text: string;
  source: SourcePointer;
}

/** CareerClaim → 简历可用事实的唯一漏斗：任何非 confirmed/user_confirmed 都返回 null。 */
export function asResumeFact(claim: CareerClaim): ConfirmedResumeFact | null {
  if (claim.status !== "confirmed" || claim.verificationLevel !== "user_confirmed") return null;
  return {
    claimId: claim.id,
    status: "confirmed",
    verificationLevel: "user_confirmed",
    text: claim.displayText,
    source: { kind: "user_material", sourceKind: claim.sourceKind === "user_statement" ? "user_statement" : "user_upload", refId: claim.id, quote: claim.sourceExcerpt ?? undefined },
  };
}

/* -------------------------------- 输入 -------------------------------- */

export interface TargetJdFields {
  roleTitle: string;
  requiredSkills: string[];
  location?: string;
  yearsMin?: number;
}

export interface ResumeBlock {
  blockId: string;
  heading: string;
  bullets: string[];
}

export interface ResumeInput {
  targetJd: TargetJdFields;
  confirmedFacts: ConfirmedResumeFact[];
  currentBlocks: ResumeBlock[];
  budget: BudgetSpec;
}

/* ------------------------------ 出处与产物 ------------------------------ */

export type SentenceProvenance =
  | { kind: "confirmed_fact"; claimId: string }
  | { kind: "resume_text"; blockId: string; quote: string };

export interface CheckedSentence {
  text: string;
  provenance: SentenceProvenance;
}

export interface DroppedSentence {
  text: string;
  claimedProvenance: SentenceProvenance | null;
  dropReason: "unknown_claim" | "quote_not_substring" | "missing_provenance" | "over_block_budget";
}

export interface ResumeBlockSuggestion {
  blockId: string;
  sentences: CheckedSentence[];
}

export interface ResumeProduct {
  suggestions: ResumeBlockSuggestion[];
  dropped: DroppedSentence[];
  perBlockTokens: Record<string, number>;
}

export const RESUME_FAILURE_COPY = "简历改写这步没跑成，先不动你的简历，我稍后补逐块建议。";

function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "");
}

/** 确定性回指闸门：claim 必须在输入集里；quote 必须归一后是该块原文子串。 */
export function checkGrounding(
  candidate: { text: string; provenance: SentenceProvenance | null },
  input: ResumeInput,
): { ok: true; sentence: CheckedSentence } | { ok: false; dropped: DroppedSentence } {
  if (!candidate.provenance) {
    return { ok: false, dropped: { text: candidate.text, claimedProvenance: null, dropReason: "missing_provenance" } };
  }
  const p = candidate.provenance;
  if (p.kind === "confirmed_fact") {
    const fact = input.confirmedFacts.find((f) => f.claimId === p.claimId);
    if (!fact) return { ok: false, dropped: { text: candidate.text, claimedProvenance: p, dropReason: "unknown_claim" } };
    return { ok: true, sentence: { text: candidate.text, provenance: p } };
  }
  const block = input.currentBlocks.find((b) => b.blockId === p.blockId);
  const haystack = block ? normalizeForMatch(block.bullets.join("\n")) : "";
  if (!block || !haystack.includes(normalizeForMatch(p.quote))) {
    return { ok: false, dropped: { text: candidate.text, claimedProvenance: p, dropReason: "quote_not_substring" } };
  }
  return { ok: true, sentence: { text: candidate.text, provenance: p } };
}

/* ------------------------------ 注入接口 ------------------------------ */

export interface BlockRewriter {
  rewriteBlock(args: { block: ResumeBlock; jd: TargetJdFields; facts: ConfirmedResumeFact[] }): Promise<
    Array<{ text: string; provenance: SentenceProvenance | null }>
  >;
}

export interface ResumeDeps {
  rewriter: BlockRewriter;
  idempotency?: IdempotencyStore<SubAgentOutcome<ResumeProduct>>;
}

export function quoteResumeFanOut(input: ResumeInput): { billingUnits: number; plannedSourceCalls: number; estimatedTokens: number; estimatedWallClockMs: number; rationale: string } {
  return {
    billingUnits: 1,
    plannedSourceCalls: input.currentBlocks.length,
    estimatedTokens: input.currentBlocks.length * input.budget.maxTokens,
    estimatedWallClockMs: input.currentBlocks.length * 3000,
    rationale: `逐块改写：${input.currentBlocks.length} 块 × 单块 token 上限 ${input.budget.maxTokens}`,
  };
}

export async function runResumeAgent(input: ResumeInput, deps: ResumeDeps): Promise<SubAgentOutcome<ResumeProduct>> {
  assertStructuredInput(input);
  const store = deps.idempotency ?? createInMemoryIdempotencyStore<SubAgentOutcome<ResumeProduct>>();
  const cached = store.get(input.budget.idempotencyKey);
  if (cached) return cached;

  const usage = {
    billingUnits: 1,
    sourceCalls: 0,
    tokens: 0,
    wallClockMs: 0,
    budget: input.budget,
  };

  const suggestions: ResumeBlockSuggestion[] = [];
  const dropped: DroppedSentence[] = [];
  const perBlockTokens: Record<string, number> = {};

  try {
    for (const block of input.currentBlocks) {
      const candidates = await deps.rewriter.rewriteBlock({ block, jd: input.targetJd, facts: input.confirmedFacts });
      usage.sourceCalls += 1;
      perBlockTokens[block.blockId] = Math.round(
        candidates.reduce((sum, c) => sum + c.text.length, 0) / 2,
      );
      // 单块超预算：该块整块扣下，不进建议（预算违规不产出半成品句子）。
      if (perBlockTokens[block.blockId] > input.budget.maxTokens) {
        dropped.push(...candidates.map((c) => ({ text: c.text, claimedProvenance: c.provenance, dropReason: "over_block_budget" as const })));
        continue;
      }
      const kept: CheckedSentence[] = [];
      for (const candidate of candidates) {
        const checked = checkGrounding(candidate, input);
        if (checked.ok) kept.push(checked.sentence);
        else dropped.push(checked.dropped);
      }
      if (kept.length > 0) suggestions.push({ blockId: block.blockId, sentences: kept });
    }
  } catch (error) {
    const failed: SubAgentOutcome<ResumeProduct> = {
      status: "failed",
      idempotencyKey: input.budget.idempotencyKey,
      usage,
      failure: {
        reason: "source_error",
        userCopy: RESUME_FAILURE_COPY,
        partialWithheld: suggestions.length > 0,
        detail: `改写引擎异常：${String(error)}`,
      },
    };
    store.set(input.budget.idempotencyKey, failed);
    return failed;
  }

  usage.tokens = Object.values(perBlockTokens).reduce((a, b) => a + b, 0);
  const outcome: SubAgentOutcome<ResumeProduct> = {
    status: "ok",
    idempotencyKey: input.budget.idempotencyKey,
    usage,
    product: { suggestions, dropped, perBlockTokens },
  };
  store.set(input.budget.idempotencyKey, outcome);
  return outcome;
}
