import { MAX_TEXT_LENGTH, type GapReport, type GapTermHit } from './matcher';

export type GapDecision = { choice: 'experience' | 'gap' | 'irrelevant'; note?: string };
export type GapDecisions = Record<string, GapDecision>;

export function gapEvidenceLabel(hit: GapTermHit, decision?: GapDecision): string {
  if (decision?.choice === 'experience') return decision.note?.trim() ? '已补经历 · 待核实' : '有经历 · 待补原文';
  if (decision?.choice === 'gap') return '本人确认尚未做过';
  if (decision?.choice === 'irrelevant') return '认为不适用 · 待核对 JD';
  return hit.status === 'direct' ? '词面命中' : hit.status === 'related' ? '相近经历 · 待确认' : '待确认';
}

/** Visible FAQ and JSON-LD use the same truth source. */
export const GAP_FAQS = [
  { question: '这是 ATS 打分吗？', answer: '不是。这里只做确定性词面命中对照，不调大模型，不产出分数。各家公司实际的筛选标准不同，请核对岗位原文。' },
  { question: '没做过的关键词，能补上吗？', answer: '不能写成已有经历。做过的，补对应的真实项目；完全没做过的，留作待学习项。相近经历可以解释迁移价值，但不要冒充已经掌握。' },
  { question: '能把结果带走吗？', answer: '可以复制或下载清单，不用登录。清单包含材料中的相关摘录，只在本机生成。进入 AI 辅导不会自动上传本页材料。' },
  { question: '一份简历投多个岗位，要各改一版吗？', answer: '同方向且关键词重叠的岗位可以共用主简历。跨方向或业务线时，保留真实经历，调整顺序和措辞，补该岗位最看重的证据。' },
] as const;

export const GAP_EXAMPLES = {
  engineering: {
    label: '后端开发',
    jdText: '高级后端开发工程师 · 上海\n3年以上经验，熟悉 Java、MySQL、Redis、Kafka。\n有分布式、高并发、Docker、Kubernetes 经验，本科及以上。',
    resumeText: '2年开发经验，熟悉 Java、MySQL。\n负责订单模块接口开发与日常维护\n参与商品服务重构，接口平均耗时下降 40%\n本科，现居上海',
  },
  product: {
    label: '产品经理',
    jdText: '产品经理 · 北京\n2年以上经验，本科及以上。负责需求分析、用户调研、PRD 和原型。\n通过数据分析、A/B测试和跨部门协作改善留存与转化率。',
    resumeText: '2年产品经理经验，本科，现居北京。\n负责需求分析、PRD 和原型设计\n参与用户调研，每月访谈 8 位用户\n与研发协作上线预约流程，转化率从 12% 提升至 16%',
  },
} as const;

export function validateGapInput(resumeText: string, jdText: string): string | null {
  if (!resumeText.trim()) return '请先粘贴简历，或试试示例。';
  if (!jdText.trim()) return '还缺目标岗位 JD，请粘贴职责和任职要求。';
  if (resumeText.length > MAX_TEXT_LENGTH || jdText.length > MAX_TEXT_LENGTH) {
    return `每份材料最多 ${MAX_TEXT_LENGTH.toLocaleString('zh-CN')} 字符。原文已保留，请缩短后再对照。`;
  }
  return null;
}

export function isGapExample(resumeText: string, jdText: string): boolean {
  return Object.values(GAP_EXAMPLES).some((example) => example.resumeText === resumeText && example.jdText === jdText);
}

/** Only derived counts reach telemetry. Never include user material or missing terms. */
export function gapEventProperties(report: GapReport, sample: boolean) {
  return { sample, missingCount: report.summary.missingCount, hardUnmet: report.summary.hardUnmet };
}

/** A local, explicitly requested artifact; no network or user identifiers. */
export function buildGapChecklist(report: GapReport, sample: boolean, decisions: GapDecisions = {}): string {
  const unmet = report.hardRequirements.filter((requirement) => !requirement.satisfied);
  return [
    `益职 AI · 简历对照清单${sample ? '（示例）' : ''}`,
    '词面初筛，不是能力评分或真实 ATS 判定。未找到证据不等于不满足。',
    '',
    '先核实硬门槛',
    ...(unmet.length ? unmet.map((item) => `[ ] ${item.label}\n    JD：${item.jdEvidence}`) : ['未发现需要补证据的硬门槛；仍请核对完整 JD。']),
    '',
    '再补真实经历',
    ...(report.summary.jdKeywordCount === 0 ? ['未抽到可对照的关键词，不能给出命中结论；请核对完整 JD，词典不覆盖所有职业。'] : report.matched.flatMap((hit) => [
      `[ ] ${hit.term}：${gapEvidenceLabel(hit, decisions[hit.term])}`,
      `    JD：${hit.jdEvidence || '请核对完整原文'}`,
      `    简历：${hit.resumeEvidence || '未找到相关原文，不等于没有经历'}`,
      `    规则：${hit.rule}`,
      ...(decisions[hit.term]?.note?.trim() ? [`    本人补充（待核实）：${decisions[hit.term].note!.trim().slice(0, 500)}`] : []),
      ...(hit.inResume && !decisions[hit.term] ? ['    仍需核对职责、范围和实际结果。'] : ['    待补证据：项目 / 我的动作 / 合作对象 / 可核验结果。没有的内容不要编造。']),
    ])),
    '',
    '最后补结果证据',
    ...(report.weakQuantification.length ? report.weakQuantification.map((line) => `[ ] ${line}\n    补充：个人动作、结果、范围或对比基准；不编数字。`) : ['未发现明显缺量化描述的条目；这不代表简历已完整。']),
    '',
    'AI 也会犯错，请检查重要信息。此清单在浏览器本地生成。',
  ].join('\n');
}
