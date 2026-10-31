import {factBlocks} from './resume-evidence-tools';

export const GROUNDING_EVIDENCE_INSTRUCTION = `事实误改必须基于主张差异，不是用词差异。
先把facts中的原主张与候选主张对照：原文已经把某机制与某结果相连，不因“提高了→使…提升”就新增因果；“20PP→20个百分点”不新增数值；不得把用户明确给定的测试结果降为未完成目标。反之，协助→主导、提案→已上线、目标→实测结果、增加未给定数据必须拒绝。
只对document.findings中category=grounding且severity=error的项补groundingEvidence，不逐句输出：
[{findingIndex:该项在document.findings的0起始序号,sourceId:"facts编号",candidateSentenceId:"candidateEvidenceIndex里的编号",dimension:"responsibility|stage|number|causality|scope|new_fact",addedClaim:"究竟多主张了什么"}]。
只选编号，不重新抄原文；后端按编号绑定完整原文/候选段落。没有这类error就groundingEvidence:[]。编号与addedClaim必须支持同一个错误；语义等价不得给error，不拿未外部核实推翻本轮前提。其他格式、贡献、价值、重复和整稿标准完全不变。
新当前任务以editingRequest及当前editorialContract为准，不从历史styleContract借回旧目标。只诊断，不改正文。`;

export const candidateEvidenceIndex = (candidate: string) => candidate.split(/\n+/)
  .map(text => text.trim()).filter(Boolean).map((text, i) => ({id: `candidate-line-${i + 1}`, text}));

/** Invalid evidence is a reviewer protocol fault, not an instruction to damage a grounded draft. */
export function groundingEvidenceIssues(review: Record<string, unknown>, facts: string, candidate: string) {
  const doc = review.document as {findings?: Array<{category?: string; severity?: string}>} | undefined;
  if (!Array.isArray(doc?.findings)) return ['GROUNDING_DOCUMENT_INVALID'];
  const errors = doc.findings.flatMap((f, i) => f.category === 'grounding' && f.severity === 'error' ? [i] : []);
  if (!Array.isArray(review.groundingEvidence)) return ['GROUNDING_EVIDENCE_MISSING'];
  const proof = review.groundingEvidence as Array<Record<string, unknown>>;
  if (proof.length > 20) return ['GROUNDING_EVIDENCE_UNMAPPED'];
  const sources = new Map(factBlocks(facts).map(b => [b.id, b.text])), seen = new Set<number>();
  const candidates = new Map(candidateEvidenceIndex(candidate).map(b => [b.id, b.text]));
  const issues: string[] = [];
  for (const p of proof) {
    const index = p?.findingIndex;
    if (typeof index !== 'number' || !Number.isSafeInteger(index) || !doc.findings[index]
      || doc.findings[index].severity !== 'error' || seen.has(index)) {
      issues.push('GROUNDING_EVIDENCE_UNMAPPED'); continue;
    }
    seen.add(index);
    const validReference = typeof p.candidateSentenceId === 'string' && candidates.has(p.candidateSentenceId);
    const validLegacyQuote = p.candidateSentenceId === undefined && typeof p.originalQuote === 'string'
      && p.originalQuote.length >= 4 && p.originalQuote.length <= 260 && sources.get(String(p.sourceId))?.includes(p.originalQuote)
      && typeof p.candidateQuote === 'string' && p.candidateQuote.length >= 4 && p.candidateQuote.length <= 260
      && candidate.includes(p.candidateQuote);
    if (typeof p.sourceId !== 'string' || !sources.has(p.sourceId) || !(validReference || validLegacyQuote)
      || typeof p.addedClaim !== 'string' || !p.addedClaim.trim()
      || !['responsibility', 'stage', 'number', 'causality', 'scope', 'new_fact'].includes(String(p.dimension))) {
      issues.push('GROUNDING_EVIDENCE_NOT_IN_INPUT');
    }
  }
  if (errors.some(index => !seen.has(index))) issues.push('GROUNDING_EVIDENCE_UNMAPPED');
  return issues;
}
