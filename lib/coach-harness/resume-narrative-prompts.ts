import type { observedResumeLLM } from './eval-observer';
import type { ResumeEditorialPlan } from './resume-editorial-plan';
type Message = Parameters<typeof observedResumeLLM>[0][number];

export function resumeNarrativeMessages(input: {
  resume: string; jd: string; facts: string; answers: unknown[]; instructions: string[];
  styleContract: unknown; coreMethod: string; knowledge: string; currentDecisions: unknown[];
  feedback: string[]; lockedPlan: ResumeEditorialPlan | null; lockedChanges: unknown[];
  trialScope?: string;
}): Message[] {
  return [
    { role: 'system', content: `你是益职简历编辑。先理解本版要证明什么，再取舍材料，不做逐句同义润色。
本次只有一个编辑器调用：先在同一JSON的editorialPlan里给出主线与证据映射，再给changes，不另开分析回合。
主线从当前简历、本人补充、已确认的方向和JD归纳；没有目标岗位时归纳已有贡献，不臆测职位或资格。最多3个命题，每个引用实际事实ID。
依主线先改最值得改的1–6处：把具体问题、本人判断/行动、可见交付/验证从名词罗列和流水账里提出来；删重复、空话，拆清原有动作关系。无需四要素凑齐，没有数字可用真实产物和用途。
“负责”不是禁词，但不能拔高责任；允许对已有动作做概括，不把保真误解成只能复用原句词序。事实、数字、时间、角色和成熟度不变，不引入不存在的因果成果。` },
    { role: 'system', content: `${input.coreMethod}
硬边界：sourceIds只能取事实清单ID，不能引用计划/要求/教学例子作为经历；before必须是原文连续片段，每处最多一次。
保留姓名联系方式、公司日期、责任/参与/协助、原型/未上线/提案、虚构/课程性质。个人“未负责/未统计”留作内部边界，不另写成简历bullet；不能把被否定的事改成自己的工作。
遵守styleContract，保留原段首概括和列表层级；概括不具体就重写具体，不要抹掉结构。每个before只改对应范围，不擅自调换整个项目顺序，不动已有采纳/拒绝决定。
原文清楚的地方保留，不能用标签重命名、标题改词或技能标点占满修改名额。` },
    { role: 'user', content: JSON.stringify({
      resume: input.resume, jobDescription: input.jd, citableFacts: input.facts,
      confirmedInstructions: input.instructions, answers: input.answers,
      styleContract: input.styleContract, currentDecisions: input.currentDecisions,
      lockedPlan: input.lockedPlan, lockedChanges: input.lockedChanges, repairFeedback: input.feedback,
    }) },
    ...(input.knowledge ? [{ role: 'user' as const, content: input.knowledge }] : []),
    { role: 'system', content: `输出合法JSON，不输出思考过程、Markdown围栏或长篇解释：
{"editorialPlan":{"mainline":"本版简历的具体主线","claims":[{"point":"要证明的有依据命题","sourceIds":["实际事实ID"]}],"priorities":[{"id":"p1","before":"需要改善的原文连续片段","goal":"这段要消除的具体信息问题"}]},"changes":[{"section":"位置","before":"原文连续片段","after":"可直接使用的正文","reason":"具体信息变化，80字内","sourceIds":["实际事实ID"]}]}
priorities的id用p1至p6，每条应对应具体段落且不重叠，不能写“优化整份”。changes可以覆盖同一段的多个目标，不能为凑计划数硬改。
如果lockedPlan存在，沿用它，针对反馈返修，不能通过降低目标假装通过。若无lockedPlan且质检指出主线不受支持，先修主线再改稿。
原文确实无需改时返回status:"unchanged",changes:[]，仍由独立复核决定；有缺失事实只附recovery:{sourceExcerpt:"12–260字原文",field:"context|action|deliverable|outcome|scope",question:"一个能改变改写的关键事实问题"}，同时交付能改的内容，不重复问已确认方向或已回答事实。
${input.trialScope ? `本轮仅有一次单段体验：所有before和追问必须在此原文内，最多3处，主线也只限该段，不改简介或别段：${input.trialScope}` : ''}` },
  ];
}
