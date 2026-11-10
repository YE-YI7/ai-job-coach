import type {F6Deliverables} from './f6-tool-session';
import type {ResumeConversationTurn} from './resume-task-types';

export const F6_MENTOR_RESPONSIBILITY = `【面向用户的导师职责】
你的目标仍是交付能让招聘方看懂真实能力的好简历，而不是完成一份事实清单。先理解业务、候选人的判断、实际干预和验证，自己决定如何取舍；有依据可以大幅重构，不要求每条都有数字或同样长度。
如果一个有价值的能力角度还缺关键事实，不要只把原话写顺，也不要默默写成已经发生。先交付已有依据的正文；把这个待确认角度、为什么值得挖、怎样回忆或补证讲给用户。可以提供几种可能的真实情形供辨认，但不是漂亮答案供冒领；用户选中也不证明选项外的细节。学习帮助复盘与表达，或未来补做验证，不把后来学会的事写成过去做过。
这类导师沟通可通过现有 write_output 在交 resume-new.md 的同一次调用里另存 changes.md，供右侧作为你发给用户的一条消息直接呈现，不进入简历正文。这里的 changes.md 不是“我改了哪几处”的报告：不复述改动清单或规格自检。只谈一个值得继续挖的具体能力/证据缺口，用自然的短对话解释为什么值得补，按需给回忆线索、可辨认的选项或一种学习/验证方法，再问一个能推进改稿的问题。已有离线/灰度验证也是验证，不把“未来全量上线”当作唯一可补方向。不要倾倒问题清单、写审计报告、让用户替你决定写法，或要求先同意才改已有材料。
是否需要追问、查哪份资料、用什么辅导方式由你判断，没有缺口就不必生成 changes.md，不为走流程强问。notes.md仍是内部选材回执，不能代替面向用户的沟通。HR点评是建议，核对后自行取舍；若回应后正文变化，辅导也应针对最后交付的正文，同次更新 changes.md，避免显示旧稿的问题。
用户后续确认、纠正、否认或想不起时，结合此前建议和最新自述继续：确认只使用真实确认的范围；否认撤回相应假设；不知道保留已知部分并给可选的回忆/学习路径，不逼编数据、不把教学示例变成用户事实。`;

/** Post-review transport channels, not a writing plan or a semantic parser. */
export const F6_MENTOR_HR_RESPONSE_CHANNELS = '已有正文已保存。回应这轮HR时，普通回复是发给用户的聊天，不会替换简历。'
  + '要交修订正文，用现有write_output保存resume-new.md；要保留正文，可以直接回复，'
  + '或只保存changes.md给用户、notes.md作内部说明。不必为结束任务重写未变的正文。';

export interface F6MentorGuidance {
  version: 1;
  text: string;
  resumeRevision: number;
  current: boolean;
}

/** A file receipt, not a semantic parser or a second model. Historical
 * changes.md files have no versioned receipt and cannot become active advice. */
export function currentF6MentorGuidance(deliverables?: F6Deliverables): string | undefined {
  const guidance = deliverables?.mentorGuidance;
  if (!guidance || guidance.version !== 1 || guidance.current !== true
    || guidance.resumeRevision !== deliverables.resumeRevision
    || typeof guidance.text !== 'string' || !guidance.text.trim()) return undefined;
  return guidance.text;
}

/** Preserve the user's whole intent, not just the fact extractor's subset.
 * The mentor's reply remains separate AI context, never an experience claim. */
export function latestF6MentorTurn(turns?: ResumeConversationTurn[]) {
  const turn = turns?.at(-1);
  return turn?.status === 'completed' ? {
    id: turn.id, userMessage: turn.message, mentorReply: turn.reply,
    provenance: '用户本轮完整消息含修改意愿/求教/确认/否认；AI回复仅供接续，不是经历事实。个人证据仍核对原稿与facts.md。',
  } : undefined;
}
