import {resumeReviewProtocolIssue} from './resume-review-diagnostic';
import {readResumeValueChecks} from './resume-edit-value';
import {readResumeRequestCoverage} from './resume-edit-request';
import type {ResumeChange} from '@/lib/opportunities/types';
/** B05 is unchanged. This contract makes evidence selection inspectable; it is not a new Agent or fact source. */
export const RESUME_EVIDENCE_HARNESS_VERSION = 'resume-evidence-harness/M06';
/** Restores the user's approved contribution objective. Source Trace supplies material, not the current instruction. */
export const CURRENT_EVIDENCE_REQUEST = `请修改同一份“益职 AI”项目经历，交付目标不是把产品定位、Harness、降本、Eval四个主题写顺，而是写清已有事实中的具体问题、本人作出的判断与取舍、实际改变的机制或交付，以及有依据的结果。
可重组、精简和选择事实，不按原句一一润色。原稿不是事实范围的上限；本人同一项目补充记录完整读入facts后，也是已有事实，不要把“原稿没写”当成编造。是否取哪些资料由你决定，不强制全选或每条凑数据。
保留项目总领加四个bullet的可读结构，但栏目齐全不是内容完成。材料里的数字和方案继续作为用户给定的测试前提，不核查是否上线，不新增未提供的事实、数字、责任或因果；含糊名词不猜释。有信息缺口可留明确待补并一次问一个关键细节，不妨碍先改已有依据的部分。`;
export const MEMORY_DISCOVERY_INSTRUCTION = `本轮给你一份本人项目资料的可选索引，它不是公共写法参考，也不是完整事实。
原稿只说“重构/优化/搭建”而没交代本人具体判断与实际干预时，可按索引自主挑选相关资料，调用context.load完整读入后再写；目录说明不能直接当已读事实。
你仍可选择不取任何资料，但交稿时须附memoryDecision:{choice:"none",reason:"为什么现有facts已足以完成具体贡献目标"}。不能默默跳过这个决定。
工具顺序由你选择，不要求全读、不要求数字、不要求照搬资料；重点是写清有依据的本人判断和实际改变。`;
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
