import type { getCurrentUserFromRequest } from '@/lib/auth';
import { createCockpitOpportunity } from './repository';
import { claimResumeTask, readResumeTask, finishResumeTask } from './resume-task';
import { runResumeDraft } from './resume-execution';
import { deliveryFromTask } from './resume-delivery';
import { recordResumeServerEvent, recordResumeDocument } from './resume-delivery-record';
import { readResumeTrace } from './resume-trace';

/** Admin-only caller creates the target here: never accept an old workspace ID.
 * The normal editor, grounding, independent review, quota and CAS save all run.
 * Requires the actor's linked provider so no hosted points/trial are consumed. */
export async function runNewResumeQaWorkflow(
  request: Request,
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUserFromRequest>>>,
  material: { resumeText: string; jobDescription: string },
  callLimit: number,
  onCreated: (coordinates: { opportunityId: string; taskId: string; generationId: string; requestId: string }) => Promise<void>,
) {
  const opportunity = await createCockpitOpportunity(user.id, {
    workspaceType: 'job', company: '内部脱敏验收 · 完整改稿', role: '同稿改稿、保存刷新与 PDF',
    stage: 'captured', jdText: material.jobDescription, resumeText: material.resumeText,
    profileText: '独立 QA 材料，不是原账号作答或正式求职记录', requirements: [], actions: [],
    location: '', stageLabel: '已收集', priority: 'low', sourceLabel: '内部脱敏验收', capturedAtLabel: '刚刚',
    recommendation: 'prepare_then_apply', recommendationLabel: '仅验收', recommendationReason: '仅验收，不投递',
    nextEventLabel: null, evidenceCoverage: { strong: 0, weak: 0, missing: 0, unverified: 0 },
    activities: [], resumeChanges: [], interviewFocus: [],
  });
  const claimed = await claimResumeTask(user.id, opportunity.id, { action: 'start' });
  if (!claimed.claimed || !claimed.lease) throw Error('QA_TASK_NOT_CLAIMED');
  const generationId = `${claimed.task.id}:${claimed.version}`;
  const requestId = `resume-task:${generationId}`;
  const coordinates = { opportunityId: opportunity.id, taskId: claimed.task.id, generationId, requestId };
  await onCreated(coordinates); // Persist recovery coordinates before a paid call.
  const started = Date.now();
  await recordResumeServerEvent(user.id, 'resume_task_started', generationId,
    deliveryFromTask(null, { generationId, taskState: 'running' }), { ...coordinates, startedAt: new Date(started).toISOString() });
  const response = await runResumeDraft(new Request(request.url, { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...material,
      opportunityId: opportunity.id, mode: 'target_resume', requestId,
      resumeTaskId: claimed.task.id, resumeTaskLease: claimed.lease,
    }),
  }), user, { editorialMode: 'narrative', maxModelCalls: callLimit, qaQuotaIsolation: true });
  const result = await response.clone().json();
  if (!result.ok) await finishResumeTask(user.id, claimed.task.id, claimed.lease, claimed.source, result).catch(() => null);
  const saved = await readResumeTask(user.id, opportunity.id);
  const trace = await readResumeTrace(user.id, requestId);
  const persisted = saved?.state === 'ready' && saved.result?.resumeGenerationId === generationId;
  const delivery = deliveryFromTask(saved, { generationId, persisted, traceId: trace?.traceId,
    newChangeCount: persisted ? saved.result?.changes.length : 0,
    hasUnresolved: Boolean(result.partial || saved?.result?.partial), reasonCode: result.reasonCode || null });
  await recordResumeServerEvent(user.id, 'resume_task_outcome', generationId, delivery,
    { ...coordinates, elapsedMs: Date.now() - started, changeIds: persisted ? saved.result?.changes.map(c => c.id) : [] });
  if (persisted) await recordResumeDocument(user.id, opportunity.id, {
    resumeText: claimed.source.resume, resumeRevision: claimed.source.revision,
    resumeGenerationId: generationId, resumeChanges: saved.result?.changes,
  });
  return Response.json({ ...result, task: saved, qa: coordinates, delivery }, { status: response.status });
}
