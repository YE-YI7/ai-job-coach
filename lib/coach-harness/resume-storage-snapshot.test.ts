import {getDbClient} from '@/lib/db';
import {FakeDb} from './run-ledger/testing/fake-db';
import {resumeStorageSnapshot} from './resume-storage-snapshot';
import {ownedResumeTaskSource,finishResumeTask} from './resume-task';
jest.mock('@/lib/db');
test('btrim compatibility keeps meaningful newline/tab bytes and does not weaken revision comparison',()=>{
  expect(resumeStorageSnapshot('  简历\n ',' JD\n ')).toEqual({resume:'简历\n',jd:'JD\n'});
  expect(resumeStorageSnapshot(' 简历 \n','\tJD\n')).toEqual({resume:'简历 \n',jd:'\tJD\n'});
  expect(resumeStorageSnapshot('简历','JD修改后\n').jd).not.toBe(resumeStorageSnapshot('简历','JD\n').jd);
});
test('actual task finalization sends the original storage snapshot, model still sees trimmed text',async()=>{
  const rawResume=' 简历正文\n ',rawJd=' JD正文\n ';
  const db=new FakeDb({coach_opportunities:[{id:'opp',user_id:'owner',status:'active',jd_text:rawJd,
    metadata:{resumeText:rawResume,resumeRevision:'rev',resumeChanges:[]}}],coach_resume_tasks:[{
    id:'task',user_id:'owner',opportunity_id:'opp',state:'running',lease_id:'lease',version:1,answers:[],
  }]});
  const rpc=jest.fn().mockResolvedValue({data:{id:'task',state:'ready',answers:[]},error:null});
  Object.assign(db,{rpc});(getDbClient as jest.Mock).mockResolvedValue(db);
  const source=await ownedResumeTaskSource('owner','opp');
  expect(source.jd).toBe('JD正文');expect(source.resume).toBe('简历正文');
  await finishResumeTask('owner','task','lease',source,{ok:true,prepared:true,changes:[]});
  expect(rpc).toHaveBeenCalledWith('finish_coach_resume_task',expect.objectContaining({
    p_user_id:'owner',p_task_id:'task',p_lease:'lease',p_revision:'rev',p_source:'简历正文\n',p_jd:'JD正文\n',
  }));
});
