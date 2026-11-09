import {FakeDb} from './run-ledger/testing/fake-db';
import {getDbClient} from '@/lib/db';
import {finishResumeTask,resumeTaskFingerprint} from './resume-task';
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
    pdf:{revision:1,receipt:{pages:1,actualPageSize:'A4'},base64:'actual-pdf-bytes-fixture',current:true}};
  const result=await finishResumeTask('owner','new-task','lease',source,{ok:true,prepared:true,changes:[],f6Deliverables});
  expect(rpc).toHaveBeenCalledWith('finish_coach_resume_task',expect.objectContaining({p_result:expect.objectContaining({f6Deliverables})}));
  expect(result.result?.f6Deliverables).toEqual(f6Deliverables);
  expect(db.rows('watcha_wallets')).toEqual([]);expect(db.rows('interview_answers')).toEqual([]);
});
