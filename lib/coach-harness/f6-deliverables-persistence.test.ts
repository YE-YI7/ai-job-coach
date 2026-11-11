import {FakeDb} from './run-ledger/testing/fake-db';
import {getDbClient} from '@/lib/db';
import {finishResumeTask,readResumeTask,resumeTaskFingerprint} from './resume-task';
import {currentF6MentorGuidance} from './f6-mentor-guidance';
import type {ResumeAgentTask} from './resume-task-types';
jest.mock('@/lib/db');
test('all F6 files and rendered PDF receipt survive task RPC and authenticated readback shape',async()=>{
  const source={resume:'原始简历',jd:'岗位',revision:'r',changes:[]};
  const db=new FakeDb({coach_opportunities:[{id:'clone',user_id:'owner',status:'active',jd_text:source.jd,
    metadata:{resumeText:source.resume,resumeRevision:'r',resumeChanges:[]}}],
  coach_resume_tasks:[{id:'new-task',user_id:'owner',opportunity_id:'clone',state:'running',lease_id:'lease',
    fingerprint:resumeTaskFingerprint(source.resume,source.jd,'r'),answers:[],version:1}]});
  const rpc=jest.fn(async(_name:string,args:{p_result:unknown})=>({error:null,
    data:{...db.rows('coach_resume_tasks')[0],state:'ready',result:args.p_result}}));
  (getDbClient as jest.Mock).mockResolvedValue(Object.assign(db,{rpc}));
  const f6Deliverables={files:{'portrait.md':'岗位画像','battle.md':'问题排序','resume-new.md':'真实新稿',
    'changes.md':'修改说明','notes.md':'选材回执'},resumeRevision:1,renderedRevision:1,
    internalReviewResponse:{text:'已核实HR引用来自原稿。',audience:'internal_review' as const,resumeRevision:1},
    pdf:{revision:1,receipt:{pages:1,actualPageSize:'A4'},base64:'actual-pdf-bytes-fixture',current:true}};
  const result=await finishResumeTask('owner','new-task','lease',source,{ok:true,prepared:true,changes:[],f6Deliverables});
  expect(rpc).toHaveBeenCalledWith('finish_coach_resume_task',expect.objectContaining({p_result:expect.objectContaining({f6Deliverables})}));
  expect(result.result?.f6Deliverables).toEqual(f6Deliverables);
  expect(db.rows('watcha_wallets')).toEqual([]);expect(db.rows('interview_answers')).toEqual([]);
});

test('unchanged current draft and its real mentor file survive save/refresh without rewriting historical answers or decisions',async()=>{
  const changes=[{id:'kept',section:'项目',before:'整理后再整理反馈。',after:'整理反馈。',
    status:'accepted' as const,reason:'上轮已接受',evidenceId:null}];
  const source={resume:'整理后再整理反馈。',jd:'',revision:'r',changes};
  const answers=[{id:'old',kind:'instruction',field:'context',sourceExcerpt:'',question:'旧要求',
    answer:'只调整这一句。',savedAt:'2026-10-25T00:00:00Z'}];
  const db=new FakeDb({coach_opportunities:[{id:'job',user_id:'owner',status:'active',jd_text:'',
    metadata:{resumeText:source.resume,resumeRevision:'r',resumeChanges:structuredClone(changes)}}],
  coach_resume_tasks:[{id:'task',user_id:'owner',opportunity_id:'job',state:'running',lease_id:'lease',
    fingerprint:resumeTaskFingerprint(source.resume,'','r'),answers:structuredClone(answers),version:7}],
  interview_answers:[{user_id:'owner',answer:'旧作答'}],
  user_quotas:[{user_id:'owner',remaining:3}],watcha_wallets:[{user_id:'owner',balance:100}]});
  type SavedResult=NonNullable<ResumeAgentTask['result']>;
  const rpc=jest.fn(async(_name:string,args:{p_source:string;p_revision:string;p_result:SavedResult;p_state:string})=>{
    expect(args.p_source).toBe(source.resume);expect(args.p_revision).toBe('r');
    expect(args.p_result.previousChanges).toEqual(changes);
    const row=db.rows('coach_resume_tasks')[0];
    Object.assign(row,{state:args.p_state,result:structuredClone(args.p_result),lease_id:null,version:8});
    return {data:structuredClone(row),error:null};
  });
  Object.assign(db,{rpc});(getDbClient as jest.Mock).mockResolvedValue(db);
  const guidance='这段具体交付已清楚；你核对反馈时采用的标准是什么？';
  await finishResumeTask('owner','task','lease',source,{ok:true,prepared:true,changes,unchanged:true,
    summary:'本轮没有新增正文修改，当前稿保留。',f6Deliverables:{
      files:{'resume-new.md':'整理反馈。','mentor.md':guidance},resumeRevision:1,renderedRevision:-1,
      mentorGuidance:{version:1,text:guidance,resumeRevision:1,current:true},
    }});
  const refreshed=await readResumeTask('owner','job');
  expect(refreshed?.result).toMatchObject({unchanged:true,changes});
  expect(currentF6MentorGuidance(refreshed?.result?.f6Deliverables)).toBe(guidance);
  expect(refreshed?.answers).toEqual(answers);
  expect(db.rows('coach_opportunities')[0].metadata).toEqual({
    resumeText:source.resume,resumeRevision:'r',resumeChanges:changes,
  });
  await expect(readResumeTask('other','job')).rejects.toThrow('不可访问');
  expect(db.rows('interview_answers')).toEqual([{user_id:'owner',answer:'旧作答'}]);
  expect(db.rows('user_quotas')).toEqual([{user_id:'owner',remaining:3}]);
  expect(db.rows('watcha_wallets')).toEqual([{user_id:'owner',balance:100}]);
});
