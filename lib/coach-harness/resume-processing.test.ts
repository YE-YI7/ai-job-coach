import {resumeProcessingSummary} from './resume-processing';
import {readResumeProcessing,resumeRequestHash,type ResumeTrace} from './resume-trace';
import {getDbClient} from '@/lib/db';
jest.mock('@/lib/db',()=>({getDbClient:jest.fn()}));
const trace:ResumeTrace={version:1,traceId:'trace-fixture',requestHash:resumeRequestHash('owned-run'),mode:'general_resume',outcome:'completed',elapsedMs:12345,
 steps:[{stage:'context',code:'own_materials_compiled',elapsedMs:5},{stage:'retrieval',code:'reviewed_methods_in_context',elapsedMs:10},{stage:'grounding',code:'proposals_checked',elapsedMs:20},{stage:'review',code:'whole_document_checked',elapsedMs:25},{stage:'review',code:'returned_to_original_editor',elapsedMs:30},{stage:'save',code:'artifact_saved',elapsedMs:35}],
 retrieval:{status:'no_close_example',candidates:0,includedIds:['method'],matches:[],documentTitles:[{id:'method',title:'简历事实边界'},{id:'excluded',title:'不在上下文的资料'}]},
 quality:{subject:'draft_quality_not_candidate',score:100,grounding:true,independentReview:true,shortBullets:true,ats:true,proposed:4,retained:2},
 editingValue:{reviewed:2,useful:2,rejected:2,kinds:[],personalDisclaimersOmitted:0,disposition:'revised'}};
test('receipt exposes only actual materials, included references, checks and saved changes, never a candidate score',()=>{
 const summary=resumeProcessingSummary(trace,false,true);
 expect(summary.materials).toEqual(['当前简历']);expect(summary.knowledge).toEqual([{id:'method',title:'简历事实边界'}]);
 expect(summary.checks).toContainEqual({label:'退回原编辑返修',status:'performed'});
 expect(summary.changedCount).toBe(2);expect(summary.saved).toBe(true);
 expect(JSON.stringify(summary)).not.toMatch(/score|100|excluded|prompt|reasoning|requestHash|resumeText/);
});
test('failure and format-only execution cannot be presented as an independently passed résumé',()=>{
 const summary=resumeProcessingSummary({...trace,outcome:'blocked',quality:null,editingValue:undefined},true,false);
 expect(summary.saved).toBe(false);expect(summary.changedCount).toBeNull();
 expect(summary.materials).toEqual(['当前简历','当前岗位 JD']);
 expect(summary.checks).not.toContainEqual(expect.objectContaining({status:'passed'}));
 expect(resumeProcessingSummary({...trace,outcome:'running',steps:[],retrieval:{...trace.retrieval,documentTitles:[],includedIds:[]},quality:null},false,false).materials).toEqual([]);
});
test('trace query is scoped to the authenticated owner, event type and exact hashed task generation',async()=>{
 const query={select:jest.fn(),eq:jest.fn(),order:jest.fn(),limit:jest.fn(),maybeSingle:jest.fn(async()=>({data:{properties:trace},error:null}))};
 for(const name of ['select','eq','order','limit'] as const)query[name].mockReturnValue(query);
 (getDbClient as jest.Mock).mockResolvedValue({from:jest.fn(()=>query)});
 expect(await readResumeProcessing('owner','owned-run',false,true)).toMatchObject({traceId:'trace-fixture'});
 expect(query.eq.mock.calls).toEqual([['user_id','owner'],['event_name','resume_agent_trace'],['properties->>requestHash',resumeRequestHash('owned-run')]]);
 expect(await readResumeProcessing('owner','different-run',false,true)).toBeUndefined();
});
