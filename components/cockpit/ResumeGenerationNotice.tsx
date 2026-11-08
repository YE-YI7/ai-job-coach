import type {ResumeAgentTask} from '@/lib/coach-harness/resume-task-types';

/** Never substitute a failed task for the saved paper or erase old decisions.
 * Put provenance beside the paper, not only inside the conversation history. */
export default function ResumeGenerationNotice({task,hasSavedChanges}:{
  task?:ResumeAgentTask|null;hasSavedChanges:boolean;
}){
  if(task?.state!=='failed')return null;
  return <p role="status" data-resume-delivery="failed">
    {hasSavedChanges
      ? '本次修改未交付。下面仍是此前保存的简历和修改建议，不是本次新稿。'
      : '本次修改未交付，下面保留原简历。'}
    {' '}原文、补充和已确认的修改没有被覆盖。可在右侧查看失败详情。
  </p>;
}
