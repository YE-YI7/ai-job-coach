import { compileContextBundle } from "@/lib/coach-harness/context";
import { assertContextFits } from "@/lib/coach-harness/prompt";
import type { CareerClaim } from "@/lib/coach-harness/types";
import { checkSourcePointers } from "./question-lineage";
import { assertInterviewPromptFits, buildInterviewStartContext, buildInterviewAnswerContext, INTERVIEW_MAX_INPUT_TOKENS } from "./start-context";

const claim = (id: number, text = `项目${id}：我负责需求验证和交付。`) => ({
  id: `fact-${id}`, entityType: "project", entityKey: `project-${id}`, claimType: "experience",
  value: text, displayText: text, sourceExcerpt: `原始记录${id}：${text}`,
  status: "confirmed", visibility: "private", sourceKind: "user_statement", verificationLevel: "user_confirmed",
} as CareerClaim);
const attachments = [
  { id: "interview-jd", label: "岗位JD", text: "负责Agent产品的需求和效果验证。", required: true },
  { id: "resume-text", label: "简历", text: "候选人的完整简历原文。", required: true },
];

test("small archives keep the original budget and full material", () => {
  const claims = [claim(1)];
  const result = buildInterviewStartContext({ userId: "owner", claims, attachments, knowledge: [] });
  expect(result.context.budget.maxInputTokens).toBe(12_000);
  expect(result.context.claims).toEqual(claims);
  expect(result.context.attachments).toEqual(attachments);
});

test("overflowing archives retain every fact and source excerpt, without mutating input", () => {
  const claims = Array.from({ length: 251 }, (_, i) => claim(i, `项目${i}真实内容。`.repeat(7)));
  const input = { userId: "owner", claims, attachments, knowledge: [] };
  const before = JSON.stringify(input);
  expect(() => assertContextFits(compileContextBundle({ ...input, task: "mock_interview",
    claimSelection: "all_required", budget: { maxInputTokens: 12_000 } }))).toThrow();
  const result = buildInterviewStartContext(input);
  expect(result.context.budget.maxInputTokens).toBeGreaterThan(12_000);
  expect(new Set(result.context.claims.map(c => c.id))).toEqual(new Set(claims.map(c => c.id)));
  expect(result.context.claims.every(c => JSON.stringify(c) === JSON.stringify(claims.find(old => old.id === c.id)))).toBe(true);
  expect(result.context.selection.excluded.filter(e => e.required)).toEqual([]);
  for (const c of claims) {
    expect(result.rendered.text).toContain(c.displayText);
    expect(result.rendered.text).toContain(c.sourceExcerpt!);
    expect(result.sourceMaterials.resume).toContainEqual({ id: c.id, text: `${c.displayText}\n${c.sourceExcerpt}` });
  }
  expect(JSON.stringify(input)).toBe(before);
});

test("confirmed-fact pointers are valid actual candidate evidence, invented pointers still fail", () => {
  const result = buildInterviewStartContext({ userId: "owner", claims: [claim(1)], attachments, knowledge: [] });
  expect(checkSourcePointers([{ source: "resume", pointer: "fact-1" }], result.sourceMaterials)).toEqual([]);
  expect(checkSourcePointers([{ source: "resume", pointer: "missing-fact" }], result.sourceMaterials)).toHaveLength(1);
});

test("answer assessment keeps large archive and mandatory answer/question without duplicate rendering", () => {
  const claims=Array.from({length:333},(_,i)=>claim(i,`项目${i}真实经历。`.repeat(7)));
  const result=buildInterviewAnswerContext({userId:"owner",claims,attachments,knowledge:[],
    currentInput:"我亲自推进验收并根据反馈修正方案。",questionSource:{id:"q1",text:"请说明验收过程。"}});
  expect(result.context.claims).toHaveLength(333);
  expect(result.context.currentInput).toBe("我亲自推进验收并根据反馈修正方案。");
  expect(result.context.questionSource?.text).toBe("请说明验收过程。");
  expect(result.rendered.text).not.toContain("我亲自推进验收并根据反馈修正方案。");
  expect(result.rendered.text).not.toContain("请说明验收过程。");
  expect(result.context.selection.excluded.filter(e=>e.required)).toEqual([]);
});

test("true overload still blocks intact material, including rendered prompt/index overhead", () => {
  const claims = [claim(1, "不能被裁掉的事实。".repeat(12_000))];
  const before = JSON.stringify(claims);
  expect(() => buildInterviewStartContext({ userId: "owner", claims, attachments, knowledge: [] })).toThrow();
  expect(JSON.stringify(claims)).toBe(before);
  expect(() => assertInterviewPromptFits("规则", "中".repeat(INTERVIEW_MAX_INPUT_TOKENS * 2))).toThrow();
  expect(() => assertInterviewPromptFits("规则", "完整材料")).not.toThrow();
});
