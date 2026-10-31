import {resumeReviewProtocolIssue} from './resume-review-diagnostic';
import {readResumeValueChecks} from './resume-edit-value';
import {readResumeRequestCoverage} from './resume-edit-request';
import type {ResumeChange} from '@/lib/opportunities/types';
/** B05 is unchanged. This contract makes evidence selection inspectable; it is not a new Agent or fact source. */
export const RESUME_EVIDENCE_HARNESS_VERSION = 'resume-evidence-harness/M05.2';
export const RESUME_EVIDENCE_EDIT_PROMPT = `先从实际可读的事实中选择最能解释本人判断和实际干预的证据，再重构正文。
editorialPlan.decisions中可增加evidence:[{sourceId:"已在facts中的编号",quote:"该编号原文的连续短摘录"}]；
为实质贡献保留证据回指，不能只在计划里宣称合并、压缩或串闭环。不是要求用完资料，也不是每条硬凑数字。
缺少关键事实可沿原recovery逐问；有依据的部分先写，不新增职责或因果，不将协作实现说成独立编码。
当前可用工具只用于回读材料，不写数据库、不改用户事实。若需要工具，暂不交草稿，返回一个JSON：
{"type":"actions","actions":[{"name":"菜单里的工具名","args":{}}],"purpose":"一句简短的取材目的"}。
工具结果会继续返回，可继续取材或按原编辑JSON合同交候选。context.load可直接按ID/版本完整读入，无须先recall。
工具顺序由你决定；无需工具也可直接写。只能引用实际进入facts的证据；目录或预览不等于已装入。`;

export const RESUME_CONTRIBUTION_REVIEW_PROMPT = `补充本轮的内容验收：结构齐全或四主题齐全，不等于完成有价值的改稿。
逐项对照实际facts、编辑计划与候选：已有具体问题、本人判断、机制/交付改动，是否被泛化成工具名清单或仍只整理原话？
不要求用完每条资料；有事实支撑的合理取舍不因漏某个词或缺数字而拒绝。原句本来清楚无需大改。
新增contributionReview:{status:"passed|failed",summary:"依据",findings:["具体漏掉的目标或未兑现的取舍"]}。
只有本轮明确应完成的贡献仍未表达时failed；不把格式改善单独充当贡献达标。
判断新增成果必须比较原主张和新主张的语义，指出新增了哪项事实/责任/阶段/因果；让与使等近义变化本身不是造假证据。
遵守本轮明确的测试前提，不把未经外部核验等同于不能按前提写；仍拒绝新增的无据责任/成果。
只诊断不改稿。原有事实、格式、整稿、requestCoverage检查继续生效，不能被contributionReview替代。`;

export function parseEvidenceJson(text: string): Record<string, unknown> {
  return JSON.parse(text.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, ''));
}

/** Verifies provenance only, never pretends literal citation proves semantic quality. */
export function checkEditorialEvidence(plan: unknown, facts: string) {
  const blocks = new Map([...facts.matchAll(/^\[([^\]\n]+)\] ([\s\S]*?)(?=\n\[[^\]\n]+\] |$)/gm)]
    .map(match => [match[1], match[2]]));
  const decisions = (plan as {decisions?: Array<{evidence?: unknown}>})?.decisions;
  const errors: string[] = [];
  for (const decision of Array.isArray(decisions) ? decisions : []) {
    if (decision.evidence === undefined) continue;
    if (!Array.isArray(decision.evidence) || decision.evidence.length > 8) {errors.push('INVALID_PLAN_EVIDENCE'); continue;}
    for (const item of decision.evidence) {
      if (!item || typeof item.sourceId !== 'string' || typeof item.quote !== 'string' || item.quote.length < 4
        || item.quote.length > 260 || !blocks.get(item.sourceId)?.includes(item.quote)) errors.push('PLAN_EVIDENCE_NOT_IN_INPUT');
    }
  }
  return errors;
}

export function evidenceReviewPassed(review: Record<string, unknown>, changeId = 'change') {
  const {contributionReview, ...existing} = review;
  if (resumeReviewProtocolIssue(existing, [{id: changeId}] as ResumeChange[])) return false;
  const checks = readResumeValueChecks(review.valueChecks, 1);
  const document = review.document as {status?: string} | undefined;
  const coverage = review.requestCoverage as {status?: string} | undefined;
  const contribution = contributionReview as {status?: string; summary?: string; findings?: unknown[]} | undefined;
  return review.status === 'passed' && document?.status === 'passed' && coverage?.status === 'complete'
    && readResumeRequestCoverage(review.requestCoverage).status === 'complete'
    && !(review.findings as Array<{severity: string}>).some(f => f.severity === 'error')
    && !(review.document as {findings: Array<{severity: string}>}).findings.some(f => f.severity === 'error')
    && checks.length === 1 && checks[0].useful && checks[0].impact !== 'correction'
    && contribution?.status === 'passed' && typeof contribution.summary === 'string'
    && Array.isArray(contribution.findings) && contribution.findings.length === 0;
}
