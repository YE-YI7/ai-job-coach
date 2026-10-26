import { runNewResumeQaWorkflow } from './resume-qa-workflow';
import { createCockpitOpportunity } from './repository';
import { claimResumeTask, readResumeTask, finishResumeTask } from './resume-task';
import { runResumeDraft } from './resume-execution';
import { recordResumeServerEvent, recordResumeDocument } from './resume-delivery-record';
jest.mock('./repository', () => ({ createCockpitOpportunity: jest.fn() }));
jest.mock('./resume-task', () => ({ claimResumeTask: jest.fn(), readResumeTask: jest.fn(), finishResumeTask: jest.fn() }));
jest.mock('./resume-execution', () => ({ runResumeDraft: jest.fn() }));
jest.mock('./resume-trace', () => ({ readResumeTrace: async () => ({ traceId: 'trace' }) }));
jest.mock('./resume-delivery-record', () => ({ recordResumeServerEvent: jest.fn(), recordResumeDocument: jest.fn() }));
const user = { id: 'owner', email: 'qa@example.invalid' } as Parameters<typeof runNewResumeQaWorkflow>[1];
const material = { resumeText: '虚构简历原文，不写入真人的原工作区', jobDescription: '虚构的岗位要求' };
beforeEach(() => {
  jest.clearAllMocks();
  (createCockpitOpportunity as jest.Mock).mockResolvedValue({ id: 'new-qa' });
  (claimResumeTask as jest.Mock).mockResolvedValue({ claimed: true, lease: 'lease', version: 1,
    task: { id: 'new-task' }, source: { resume: material.resumeText, jd: material.jobDescription, revision: 'rev' } });
  (runResumeDraft as jest.Mock).mockResolvedValue(Response.json({ ok: true, changes: [{ id: 'change' }] }));
  (readResumeTask as jest.Mock).mockResolvedValue({ state: 'ready', result: { resumeGenerationId: 'new-task:1', changes: [{ id: 'change' }] } });
});
test('a new QA target uses actual lease/CAS persistence and a four-call ceiling, not a saved-output replay', async () => {
  const saved = jest.fn();
  const response = await runNewResumeQaWorkflow(new Request('https://candidate.invalid'), user, material, 4, saved);
  expect(saved).toHaveBeenCalledWith({ opportunityId: 'new-qa', taskId: 'new-task', generationId: 'new-task:1', requestId: 'resume-task:new-task:1' });
  expect(createCockpitOpportunity).toHaveBeenCalledWith('owner', expect.any(Object), { workspaceResumeOnly: true });
  expect(saved.mock.invocationCallOrder[0]).toBeLessThan((runResumeDraft as jest.Mock).mock.invocationCallOrder[0]);
  const [request, actor, options] = (runResumeDraft as jest.Mock).mock.calls[0];
  expect(actor).toBe(user);
  expect(options).toEqual({ editorialMode: 'narrative', maxModelCalls: 4, qaQuotaIsolation: true });
  expect(await request.json()).toMatchObject({ ...material, opportunityId: 'new-qa', resumeTaskId: 'new-task', resumeTaskLease: 'lease' });
  expect((await response.json()).delivery.persistence).toBe('confirmed');
  expect(recordResumeDocument).toHaveBeenCalledTimes(1);
  expect(recordResumeServerEvent).toHaveBeenCalledTimes(2);
});
test('returned output without a committed generation cannot become a saved document', async () => {
  (readResumeTask as jest.Mock).mockResolvedValue({ state: 'failed', result: null });
  const result = await runNewResumeQaWorkflow(new Request('https://candidate.invalid'), user, material, 4, async () => undefined);
  expect((await result.json()).delivery.persistence).toBe('not_persisted');
  expect(recordResumeDocument).not.toHaveBeenCalled();
  expect(finishResumeTask).not.toHaveBeenCalled();
});

test('an empty JD uses the real general-resume path, without inventing a target job', async () => {
  await runNewResumeQaWorkflow(new Request('https://candidate.invalid'), user,
    { ...material, jobDescription: '' }, 4, async () => undefined);
  expect(createCockpitOpportunity).toHaveBeenCalledWith('owner', expect.objectContaining({
    workspaceType: 'preparation', jdText: '',
  }), { workspaceResumeOnly: true });
  const [request] = (runResumeDraft as jest.Mock).mock.calls[0];
  expect(await request.json()).toMatchObject({ mode: 'general_resume', jobDescription: '' });
});
