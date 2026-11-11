import type {ResumeChange} from '@/lib/opportunities/types';
import type {ResumeAgentAnswer, ResumeAgentTask} from './resume-task-types';
import {resumeConversationDraftContext} from './resume-conversation-context';
export {isCurrentResumeUnchanged} from './resume-diff';

/** Editing and factual grounding have different baselines. Reuse the editor's
 * projection; a generated file or an old instruction is not the current draft. */
export function resumeEditingContext(
  source: {resume: string; changes: ResumeChange[]; revision?: string},
  task: {answers: ResumeAgentAnswer[]; result?: ResumeAgentTask['result'] | null},
  action?: string,
) {
  const current = resumeConversationDraftContext(source, {result: task.result || undefined});
  if (current.text === null) throw Error('当前简历无法完整读取，原文和修改仍保留；请刷新核对，尚未调用模型。');
  const history = task.answers.filter(answer => answer.kind === 'instruction');
  // Only an explicit new request is a command for this run. Old instructions
  // remain available for the author to judge, not erased or replayed as orders.
  const request = action === 'revise' || action === 'conversation' ? history.at(-1)?.answer || '' : '';
  return {
    current: {...current, text: current.text},
    task: {
      action: action || (task.result ? 'restart' : 'start'),
      request,
      purpose: '修改当前可见稿 resume.md，而不是重新执行历史任务。结合本次意图判断仍适用的方向与取舍。',
    },
    instructionHistory: history.map(({id, answer, savedAt}) => ({id, text: answer, savedAt})),
    documentRoles: {
      'resume.md': '本次编辑与比较的当前稿；包含待确认建议及用户已作的取舍，不是新增事实证据。',
      'original-resume.md': '原始材料，只用于核源和保留责任、身份等事实边界，不是本轮编辑起点。',
      instructionHistory: '历史要求，不自动生效；已完成的局部任务不重复执行，不能据此限制本轮范围。',
    },
  };
}

export type ResumeEditingContext = ReturnType<typeof resumeEditingContext>;

