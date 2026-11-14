import origin from './f6-origin.json';
import {resumableKnowledgeDocuments} from '@/lib/knowledge/document-repository';

// Only already-redacted teaching cards. S002/S003 are local-private originals
// and must not be promoted into a shared public lookup by this consolidation.
const cards = [
  ['S004', 'teaching.agent-infra-owner.v1', 'Agent Infra：从功能清单提炼本人架构贡献',
    '工程或Agent基础设施经历需要说明本人责任、架构取舍与验证时参考；不证明录用或可移植成果。'],
  ['S005', 'teaching.strategy-iteration.v1', '策略产品：从迭代里选出判断和取舍',
    '有多版策略和副作用材料、需要重构本人贡献时参考；没有相关事实时不套用诊断。'],
  ['S006', 'teaching.multi-model-handoff.v1', '多模型接力：具体重复开销与验证',
    '材料涉及失败接续、重复推理开销或多模型协作时参考；没有本人设计证据时不冒领。'],
  ['S007', 'teaching.context-cost.v1', '上下文降本：保留有口径的决策证据',
    '有上下文或成本实验材料、需要取舍方法清单时参考；指标和结论只能来自当前用户。'],
] as const;

export function f6KnowledgeCatalogue() {
  return [...resumableKnowledgeDocuments(), ...cards.map(([key, id, title, description]) => ({
    id, title, description, goal: '学习选材与表达，不移植案例事实。',
    useWhen: [description], doNotUseWhen: ['将案例经历或数字当作用户事实'],
    content: origin.resources[key], confidence: 'low', reviewedAt: '2026-11-13',
    evidence: [] as Array<{url: string}>, resumeProfile: undefined,
  }))];
}
