import { createHash } from 'node:crypto';
import { getDbClient } from '@/lib/db';
import { createCockpitOpportunity } from './repository';
import { FakeDb } from './run-ledger/testing/fake-db';
jest.mock('@/lib/db');
jest.mock('./run-ledger/events', () => ({ intakeEvent: jest.fn() }));

test('a no-JD QA source deduplicates bytes but creates only its own scoped facts', async () => {
  const resume = '需求整理：访谈业务人员，整理需求清单交给产品同事讨论。';
  const originalClaim = { id: 'old-claim', user_id: 'owner', source_id: 'shared-source',
    opportunity_id: null, entity_key: 'old-key', status: 'confirmed', display_text: resume };
  const db = new FakeDb({ coach_sources: [{ id: 'shared-source', user_id: 'owner',
    content_hash: createHash('sha256').update(resume).digest('hex') }], coach_claims: [originalClaim] });
  (getDbClient as jest.Mock).mockResolvedValue(db);
  const job = await createCockpitOpportunity('owner', {
    workspaceType: 'preparation', company: '内部脱敏验收', role: '验收', stage: 'captured',
    resumeText: resume, requirements: [], actions: [],
    location: '', stageLabel: '已收集', priority: 'low', sourceLabel: '验收', capturedAtLabel: '刚刚',
    recommendation: 'prepare_then_apply', recommendationLabel: '仅验收', recommendationReason: '仅验收，不投递',
    nextEventLabel: null, evidenceCoverage: { strong: 0, weak: 0, missing: 0, unverified: 0 },
    activities: [], resumeChanges: [], interviewFocus: [],
  }, { workspaceResumeOnly: true });
  expect(db.rows('coach_sources')).toHaveLength(1);
  expect(db.rows('coach_claims').find(row => row.id === 'old-claim')).toEqual(originalClaim);
  const newClaims = db.rows('coach_claims').filter(row => row.id !== 'old-claim');
  expect(newClaims).toHaveLength(1);
  expect(newClaims[0]).toMatchObject({ user_id: 'owner', opportunity_id: job.id, source_id: 'shared-source' });
});
