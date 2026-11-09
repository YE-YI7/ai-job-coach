import {getDbClient} from '@/lib/db';
import {FakeDb} from './run-ledger/testing/fake-db';
import {updateCockpitOpportunity} from './repository';
import {demoOpportunities} from '@/lib/opportunities/demo';
import {annotateF6Changes} from './resume-f6-delivery';
import {applyResumeChanges} from './application-quality';
import {decideResumeChanges} from '@/lib/opportunities/resume-agent-merge';
import {applyUserResumeEdit} from '@/lib/opportunities/resume-edit';
import type {Opportunity} from '@/lib/opportunities/types';

jest.mock('@/lib/db');
test('actual repository JSON save/readback retains notices and decisions without touching other owners or answers',async()=>{
  const original='整理评测记录。',after='主导评测并覆盖500人。';
  const changes=annotateF6Changes([{id:'change',before:original,after,section:'项目',reason:'待确认',
    evidenceId:null,status:'pending'}],[{id:'source',text:original}]);
  const opportunity={...demoOpportunities[0],id:'job',resumeText:original,jdText:'JD',
    resumeRevision:'r1',resumeGenerationId:'g1',resumeChanges:changes,
    applicationQuality:{artifactId:'artifact',version:1,status:'draft' as const,reviews:[{
      reviewerType:'independent_ai' as const,status:'warning' as const,
      summary:'独立 HR 点评（针对首稿）\n请核实主导责任，不是审核通过。',
    },{
      reviewerType:'facts' as const,status:'not_run' as const,summary:'依据待确认。',
    }]}};
  const {id:_,company,role,stage,jdText,...metadata}=opportunity;
  expect(_).toBe('job');
  const other={id:'other',user_id:'another-owner',metadata:{resumeText:'他人简历',answers:['旧作答']}};
  const db=new FakeDb({coach_opportunities:[{id:'job',user_id:'owner',company,role,stage,jd_text:jdText,
    jd_version:1,updated_at:'2026-11-09T00:00:00Z',metadata},other],
    coach_resume_tasks:[{id:'old-task',answers:['既有面试作答']}],wallets:[{user_id:'owner',points:99}]});
  (getDbClient as jest.Mock).mockResolvedValue(db);
  const protectedBefore=JSON.stringify([other,db.rows('coach_resume_tasks'),db.rows('wallets')]);
  await updateCockpitOpportunity('owner',opportunity,true);
  const row=await db.from('coach_opportunities').select('metadata').eq('id','job').eq('user_id','owner').single();
  const restored=JSON.parse(JSON.stringify((row.data as {metadata:Opportunity}).metadata)) as Opportunity;
  expect(restored.resumeChanges[0].evidenceNotices).toEqual(changes[0].evidenceNotices);
  expect(restored.applicationQuality).toEqual(opportunity.applicationQuality);
  expect(applyResumeChanges(original,restored.resumeChanges).text).toBe(after);
  const accepted={...opportunity,resumeChanges:decideResumeChanges(restored.resumeChanges,'change','accepted')};
  await updateCockpitOpportunity('owner',accepted,true);
  const refreshed=await db.from('coach_opportunities').select('metadata').eq('id','job').eq('user_id','owner').single();
  const refreshedChanges=(refreshed.data as {metadata:Opportunity}).metadata.resumeChanges;
  expect(refreshedChanges[0].status).toBe('accepted');
  expect(applyResumeChanges(original,refreshedChanges).text).toBe(after);
  const ownEdit=applyUserResumeEdit(accepted,'change','本人核对后手写500人。');
  expect(ownEdit.resumeChanges[0].evidenceNotices).toBeUndefined();
  expect(ownEdit.applicationQuality?.reviews.find(review=>review.reviewerType==='facts')?.status).toBe('not_run');
  expect(ownEdit.applicationQuality?.reviews.find(review=>review.reviewerType==='independent_ai')?.status).toBe('not_run');
  await expect(updateCockpitOpportunity('intruder',opportunity,true)).rejects.toThrow('岗位不存在');
  expect(JSON.stringify([db.rows('coach_opportunities').find(r=>r.id==='other'),
    db.rows('coach_resume_tasks'),db.rows('wallets')])).toBe(protectedBefore);
});
