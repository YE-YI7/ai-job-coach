import type { ResumeAgentTask } from './resume-task-types';

export interface ResumeRequestResult {
  ok: boolean;
  error?: string;
  task?: ResumeAgentTask | null;
  replayed?: boolean;
  conversationDecision?: string;
}

/** A returned task is not evidence that this request generated a new draft. */
export function resumeRequestFeedback(result: ResumeRequestResult, action: string): string {
  const task = result.task;
  if (result.conversationDecision === 'discuss') return '导师已回复，简历未改动';
  if (task?.state === 'failed') return task.error || '本轮修改未完成，原稿和补充仍保留';
  if (task?.state === 'running') return '改稿仍在进行，请等待本轮结果';
  if (result.replayed) {
    if (action === 'skip') return '已跳过这条补充，现有简历保持不变';
    return '返回的是已有任务，本次没有生成新稿；如需重新修改，请点“重新修改整份”';
  }
  if (task?.state === 'needs_detail') return '导师还有一个问题，可以继续讨论';
  if (task?.state !== 'ready') return '改稿结果尚未确认，请稍后查看进度';
  const receipt = task.delivery;
  if (receipt && receipt.persistence !== 'confirmed') return '修改结果尚未确认保存，请稍后查看进度';
  if (task.result?.unchanged || receipt?.outcome === 'unchanged') {
    return '本轮没有新增修改，当前简历保持不变';
  }
  if (!task.result?.changes?.length) return '本轮没有返回可确认的修改，当前简历保持不变';
  if (receipt?.outcome === 'partial_delivered') return '部分修改建议已保存，还有待核对的内容';
  return '本轮修改建议已保存，请在纸面上核对';
}
