import {createHash} from 'node:crypto';
import {applyResumeChanges} from './application-quality';
import type {ResumeChange} from '@/lib/opportunities/types';
import type {ResumeAgentTask} from './resume-task-types';

/** The same clean projection the editor displays, not a new factual source.
 * A declined/manual edit must win over the last model-generated file. */
export function resumeConversationDraftContext(
  source: {resume:string; changes:unknown[]; revision?:string},
  task: ResumeAgentTask,
) {
  const valid = source.changes.every(change => {
    if (!change || typeof change !== 'object') return false;
    const item = change as Partial<ResumeChange>;
    return typeof item.id === 'string' && typeof item.before === 'string'
      && typeof item.after === 'string' && ['pending','accepted','rejected'].includes(item.status || '');
  });
  const generated = task.result?.f6Deliverables?.files['resume-new.md'];
  const projection = valid ? applyResumeChanges(source.resume, source.changes as ResumeChange[]) : null;
  const complete = Boolean(projection && !projection.findings.length);
  const text = complete ? projection!.text : null;
  return {
    sourceRevision: source.revision || null,
    originalSha256: createHash('sha256').update(source.resume).digest('hex'),
    generationId: task.result?.resumeGenerationId || null,
    projectionStatus: complete ? 'current' as const : 'unresolved' as const,
    text,
    sha256: text === null ? null : createHash('sha256').update(text).digest('hex'),
    matchesLastGenerated: text === null || !generated ? null : text.trim() === generated.trim(),
    findings: projection?.findings || [{code:'invalid_change_record',message:'修改记录无法完整投影，不能当成最新完整稿。'}],
    provenance: '当前工作区的完整修改预览，含待确认建议与用户已作的取舍；不是新增事实证据。'
      + '事实仍核对原稿resume和用户conversation[].user；最新明确纠正优先。',
  };
}
