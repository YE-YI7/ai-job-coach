import { POST } from "./route";
import { isTrivialRewrite } from "@/lib/coach-harness/resume-diff";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { callLLM } from "@/lib/llm";
import { finalizeQuota, reserveQuota } from "@/lib/quota";
import { applyResumeChanges, reviewAtsText, compileContextBundle } from "@/lib/coach-harness";
import { resumeTaskInput, persistResumeAnswerClaims,ownedResumeTaskSource,finishResumeTask } from "@/lib/coach-harness/resume-task";
import { createArtifactWithClaims, getContextBundleForUser, recordArtifactReview } from "@/lib/coach-harness/repository";
import {runWithGenerationContext} from "@/lib/generation-context";
import {startResumeTrace} from "@/lib/coach-harness/resume-trace";

jest.mock("@/lib/auth");
jest.mock("@/lib/llm");
jest.mock("@/lib/quota");
jest.mock("@/lib/coach-harness/resume-task");
jest.mock("@/lib/coach-harness/resume-trace", () => ({ startResumeTrace: jest.fn() }));
jest.mock("@/lib/generation-context", () => ({ runWithGenerationContext: jest.fn((_context: unknown, run: () => unknown) => run()) }));
jest.mock("@/lib/tokenpay-recovery", () => ({ tokenPayRecoveryResponse: () => null }));
jest.mock("@/lib/coach-harness/repository", () => ({
  createArtifactWithClaims: jest.fn(),
  getContextBundleForUser: jest.fn(),
  recordArtifactReview: jest.fn(),
}));
jest.mock("@/lib/coach-harness", () => ({
  ContextBudgetExceededError: class extends Error { blocked: unknown[] = []; },
  applyResumeChanges: jest.fn(),
  assertContextFits: jest.fn(),
  compileContextBundle: jest.fn(),
  renderCitableFactsForPrompt: jest.fn(() => ({ text: "[claim-1] 负责模型评测", usedTokens: 20, warnings: [] })),
  reviewAtsText: jest.fn(),
  validateArtifactDraft: jest.fn(() => ({ ok: true, issues: [] })),
}));

const usefulValueChecks=[0,1].map(index=>({index,useful:true,kind:'clarity',reason:'将实际评测动作与交付口径对应，便于读者理解'}));

describe("resume draft source mapping", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (callLLM as jest.Mock).mockReset();
    (resumeTaskInput as jest.Mock).mockReset();
    (ownedResumeTaskSource as jest.Mock).mockReset();
    (finishResumeTask as jest.Mock).mockReset();
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({ id: "user-1" });
    (reserveQuota as jest.Mock).mockResolvedValue({ source: "free", remaining: 0 });
    (finalizeQuota as jest.Mock).mockResolvedValue(undefined);
    (compileContextBundle as jest.Mock).mockImplementation(input=>input);
    (persistResumeAnswerClaims as jest.Mock).mockResolvedValue([]);
    (startResumeTrace as jest.Mock).mockResolvedValue({ data: {}, step: jest.fn(), finish: jest.fn().mockResolvedValue(undefined) });
    (getContextBundleForUser as jest.Mock).mockResolvedValue({
      allowedClaimIds: ["claim-1"], unverifiedClaimIds: [], selection: { included: [], excluded: [] },
      budget: { maxInputTokens: 12_000 }, usage: { truncated: false }, claims: [], artifacts: [], knowledge: [], attachments: [],
    });
  });

  afterEach(() => jest.restoreAllMocks());

  test('cosmetic labels never become a paid deliverable',async()=>{
    (resumeTaskInput as jest.Mock).mockResolvedValue({opportunity_id:'opp-1',answers:[]});
    (callLLM as jest.Mock).mockResolvedValue(JSON.stringify({changes:[{before:'Excel、Word',after:'办公软件：Excel、Word',sourceIds:['claim-1']}]}));
    const response=await POST(new Request('https://example.com',{method:'POST',body:JSON.stringify({opportunityId:'opp-1',resumeText:'Excel、Word',mode:'general_resume',resumeTaskId:'task',resumeTaskLease:'lease'})}));
    expect(response.status).toBe(422);expect(callLLM).toHaveBeenCalledTimes(3);expect(createArtifactWithClaims).not.toHaveBeenCalled();expect(finalizeQuota).toHaveBeenCalledWith(expect.anything(),false);
  });

  test('purely cosmetic attempts can end unchanged only after independent original review',async()=>{
    (resumeTaskInput as jest.Mock).mockResolvedValue({opportunity_id:'opp-1',answers:[]});
    (ownedResumeTaskSource as jest.Mock).mockResolvedValue({resume:'Excel、Word',jd:'',revision:'r',changes:[]});
    (finishResumeTask as jest.Mock).mockResolvedValue({state:'ready',result:{changes:[],unchanged:true}});
    const cosmetic=JSON.stringify({changes:[{before:'Excel、Word',after:'办公软件：Excel、Word',sourceIds:['claim-1']}]});
    (callLLM as jest.Mock).mockResolvedValueOnce(cosmetic).mockResolvedValueOnce(cosmetic).mockResolvedValueOnce(JSON.stringify({status:'passed',unchanged:true,summary:'现有技能清单清楚，增加标签没有信息价值。'}));
    const response=await POST(new Request('https://example.com',{method:'POST',body:JSON.stringify({opportunityId:'opp-1',resumeText:'Excel、Word',mode:'general_resume',resumeTaskId:'task',resumeTaskLease:'lease'})}));
    expect(response.status).toBe(200);expect(await response.json()).toMatchObject({unchanged:true,changes:[]});expect(callLLM).toHaveBeenCalledTimes(3);expect(finalizeQuota).toHaveBeenCalledWith(expect.anything(),false);
  });

  test('factually approved edits still require independent value approval',async()=>{
    (callLLM as jest.Mock).mockResolvedValueOnce(JSON.stringify({changes:[{before:'负责模型评测',after:'模型评测覆盖准确率口径',sourceIds:['claim-1']}]})).mockResolvedValueOnce(JSON.stringify({status:'passed',findings:[]}));
    const response=await POST(new Request('https://example.com',{method:'POST',body:JSON.stringify({opportunityId:'opp-1',resumeText:'负责模型评测',mode:'general_resume'})}));
    expect(response.status).toBe(422);expect(createArtifactWithClaims).not.toHaveBeenCalled();expect(finalizeQuota).toHaveBeenCalledWith(expect.anything(),false);
  });

  test.each(['unchanged',undefined])('independently checked empty result (%s) keeps existing decisions and does not charge generation success',async status=>{
    const changes=[{id:'accepted',before:'旧句',after:'已采纳句',status:'accepted'}];
    (resumeTaskInput as jest.Mock).mockResolvedValue({opportunity_id:'opp-1',answers:[]});
    (ownedResumeTaskSource as jest.Mock).mockResolvedValue({resume:'负责模型评测',jd:'',revision:'r',changes});
    (finishResumeTask as jest.Mock).mockResolvedValue({state:'ready',result:{changes,unchanged:true}});
    (callLLM as jest.Mock).mockResolvedValueOnce(JSON.stringify({status,changes:[]})).mockResolvedValueOnce(JSON.stringify({status:'passed',unchanged:true,summary:'现有动作与交付已经清楚，无需重复改写。'}));
    const response=await POST(new Request('https://example.com',{method:'POST',body:JSON.stringify({opportunityId:'opp-1',resumeText:'负责模型评测',mode:'general_resume',resumeTaskId:'task',resumeTaskLease:'lease'})}));
    expect(response.status).toBe(200);expect(await response.json()).toMatchObject({unchanged:true,changes});
    expect(finishResumeTask).toHaveBeenCalledWith('user-1','task','lease',expect.anything(),expect.objectContaining({unchanged:true,changes,prepared:true}));
    expect(finalizeQuota).toHaveBeenCalledWith(expect.anything(),false);expect(createArtifactWithClaims).not.toHaveBeenCalled();
  });

  test('an explicit unfilled experience gets one question only after safe drafting fails',async()=>{
    const resumeText='参与校园二手平台项目，主要负责需求相关工作，具体个人交付还没梳理。';
    (resumeTaskInput as jest.Mock).mockResolvedValue({opportunity_id:'opp-1',answers:[]});
    (callLLM as jest.Mock).mockResolvedValue(JSON.stringify({changes:[]}));
    const response=await POST(new Request('https://example.com/api/coach/resume-draft',{method:'POST',body:JSON.stringify({opportunityId:'opp-1',resumeText,mode:'general_resume',resumeTaskId:'task',resumeTaskLease:'lease'})}));
    expect(response.status).toBe(422);expect(await response.json()).toMatchObject({reasonCode:'resume_detail_needed',recovery:{field:'deliverable',sourceExcerpt:resumeText}});expect(callLLM).toHaveBeenCalledTimes(2);expect(finalizeQuota).toHaveBeenCalledWith(expect.anything(),false);
  });

  test('an empty provider response uses the one repair slot and never itself means unchanged',async()=>{
    (resumeTaskInput as jest.Mock).mockResolvedValue({opportunity_id:'opp-1',answers:[]});
    (ownedResumeTaskSource as jest.Mock).mockResolvedValue({resume:'负责模型评测',jd:'',revision:'r',changes:[]});
    (finishResumeTask as jest.Mock).mockResolvedValue({state:'ready',result:{changes:[],unchanged:true}});
    (callLLM as jest.Mock).mockRejectedValueOnce(new Error('Empty response from LLM (finish_reason=length)'))
      .mockResolvedValueOnce(JSON.stringify({status:'unchanged',changes:[]}))
      .mockResolvedValueOnce(JSON.stringify({status:'passed',unchanged:true,summary:'现有动作与交付已经清楚，无需重复改写。'}));
    const response=await POST(new Request('https://example.com',{method:'POST',body:JSON.stringify({opportunityId:'opp-1',resumeText:'负责模型评测',mode:'general_resume',resumeTaskId:'task',resumeTaskLease:'lease'})}));
    expect(response.status).toBe(200);expect(await response.json()).toMatchObject({unchanged:true});
    expect(callLLM).toHaveBeenCalledTimes(3);expect(reserveQuota).toHaveBeenCalledTimes(1);expect(finalizeQuota).toHaveBeenCalledWith(expect.anything(),false);
  });

  test('empty drafts on a clearly vague experience recover with one question without inventing a missing-evidence error',async()=>{
    const resumeText='参加过校园二手平台项目，参与需求相关工作。';
    (resumeTaskInput as jest.Mock).mockResolvedValue({opportunity_id:'opp-1',answers:[]});
    (callLLM as jest.Mock).mockResolvedValue(JSON.stringify({changes:[]}));
    const response=await POST(new Request('https://example.com',{method:'POST',body:JSON.stringify({opportunityId:'opp-1',resumeText,mode:'general_resume',resumeTaskId:'task',resumeTaskLease:'lease'})}));
    expect(response.status).toBe(422);expect(await response.json()).toMatchObject({reasonCode:'resume_detail_needed',recovery:{sourceExcerpt:resumeText,field:'action'}});
    expect(finalizeQuota).toHaveBeenCalledWith(expect.anything(),false);
  });

  test('splitting a vague responsibility cannot pretend to add a concrete action',async()=>{
    const resumeText='参加过校园失物招领平台项目，参与需求相关工作。';
    (resumeTaskInput as jest.Mock).mockResolvedValue({opportunity_id:'opp-1',answers:[]});
    (callLLM as jest.Mock).mockResolvedValue(JSON.stringify({changes:[{before:resumeText,after:'- 参与校园失物招领平台项目\n- 协助梳理需求相关内容',sourceIds:['claim-1']}]}));
    const response=await POST(new Request('https://example.com',{method:'POST',body:JSON.stringify({opportunityId:'opp-1',resumeText,mode:'general_resume',resumeTaskId:'task',resumeTaskLease:'lease'})}));
    expect(await response.json()).toMatchObject({reasonCode:'resume_detail_needed',recovery:{field:'action'}});expect(createArtifactWithClaims).not.toHaveBeenCalled();
  });

  test('malformed model JSON gets one bounded repair before a draft is delivered',async()=>{
    (resumeTaskInput as jest.Mock).mockResolvedValue({opportunity_id:'opp-1',answers:[]});
    (callLLM as jest.Mock).mockResolvedValueOnce('{"changes": [broken]}')
      .mockResolvedValueOnce(JSON.stringify({changes:[{before:'负责模型评测',after:'模型评测覆盖准确率口径',sourceIds:['claim-1']}]}))
      .mockResolvedValueOnce(JSON.stringify({status:'passed', valueChecks: usefulValueChecks,findings:[]}));
    (applyResumeChanges as jest.Mock).mockReturnValue({text:'模型评测覆盖准确率口径',findings:[]});(reviewAtsText as jest.Mock).mockReturnValue({ok:true,coverage:1,findings:[]});(createArtifactWithClaims as jest.Mock).mockResolvedValue({id:'art',version:1});(recordArtifactReview as jest.Mock).mockResolvedValue({});
    const response=await POST(new Request('https://example.com/api/coach/resume-draft',{method:'POST',body:JSON.stringify({opportunityId:'opp-1',resumeText:'负责模型评测',mode:'general_resume',resumeTaskId:'task',resumeTaskLease:'lease'})}));
    expect(response.status).toBe(200);expect(callLLM).toHaveBeenCalledTimes(3);expect(reserveQuota).toHaveBeenCalledTimes(1);expect(finalizeQuota).toHaveBeenCalledWith(expect.anything(),true);
  });

  test('repeated malformed JSON stops, refunds and never exposes parser jargon',async()=>{
    (resumeTaskInput as jest.Mock).mockResolvedValue({opportunity_id:'opp-1',answers:[]});
    (callLLM as jest.Mock).mockResolvedValue('{"changes": [broken]}');
    const response=await POST(new Request('https://example.com/api/coach/resume-draft',{method:'POST',body:JSON.stringify({opportunityId:'opp-1',resumeText:'负责模型评测',mode:'general_resume',resumeTaskId:'task',resumeTaskLease:'lease'})}));
    expect(response.status).toBe(500);expect((await response.json()).error).toBe('导师返回的内容暂时无法整理。原文和补充已保留，本次未扣额度，可以重试。');expect(callLLM).toHaveBeenCalledTimes(2);expect(createArtifactWithClaims).not.toHaveBeenCalled();expect(finalizeQuota).toHaveBeenCalledWith(expect.anything(),false);
  });

  test.each(['ready','stale'])('commit %s is checked before successful quota settlement',async state=>{
    (resumeTaskInput as jest.Mock).mockResolvedValue({opportunity_id:'opp-1',answers:[]});
    (ownedResumeTaskSource as jest.Mock).mockResolvedValue({resume:'负责模型评测',jd:'',revision:'r',changes:[]});
    (finishResumeTask as jest.Mock).mockResolvedValue({state,result:{changes:[]}});
    (callLLM as jest.Mock).mockResolvedValueOnce(JSON.stringify({changes:[{before:'负责模型评测',after:'模型评测覆盖准确率口径',sourceIds:['claim-1']}]})).mockResolvedValueOnce(JSON.stringify({status:'passed', valueChecks: usefulValueChecks,findings:[]}));
    (applyResumeChanges as jest.Mock).mockReturnValue({text:'模型评测覆盖准确率口径',findings:[]});(reviewAtsText as jest.Mock).mockReturnValue({ok:true,coverage:1,findings:[]});(createArtifactWithClaims as jest.Mock).mockResolvedValue({id:'art',version:1});(recordArtifactReview as jest.Mock).mockResolvedValue({});
    const response=await POST(new Request('https://example.com/api/coach/resume-draft',{method:'POST',body:JSON.stringify({opportunityId:'opp-1',resumeText:'负责模型评测',mode:'general_resume',resumeTaskId:'task',resumeTaskLease:'lease'})}));
    expect(finishResumeTask).toHaveBeenCalled();
    expect(finalizeQuota).toHaveBeenCalledWith(expect.anything(),state==='ready');
    expect((finishResumeTask as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan((finalizeQuota as jest.Mock).mock.invocationCallOrder[0]);
    expect(response.status).toBe(state==='ready'?200:500);
  });

  test('normalizes only a unique PDF punctuation span back to actual original bytes',async()=>{
    const before='负责模型评测,记录准确率口径。';
    (callLLM as jest.Mock).mockResolvedValueOnce(JSON.stringify({changes:[{before:before.replace(',', '，'),after:'模型评测覆盖准确率口径',sourceIds:['claim-1']}]})).mockResolvedValueOnce(JSON.stringify({status:'passed', valueChecks: usefulValueChecks,findings:[]}));
    (applyResumeChanges as jest.Mock).mockReturnValue({text:'预览',findings:[]});(reviewAtsText as jest.Mock).mockReturnValue({ok:true,coverage:1,findings:[]});(createArtifactWithClaims as jest.Mock).mockResolvedValue({id:'art',version:1});(recordArtifactReview as jest.Mock).mockResolvedValue({});
    const response=await POST(new Request('https://example.com/api/coach/resume-draft',{method:'POST',body:JSON.stringify({opportunityId:'opp-1',resumeText:before,mode:'general_resume'})}));
    expect(response.status).toBe(200);expect((await response.json()).changes[0].before).toBe(before);
  });

  test('a skill-only change cannot masquerade as completion of saved experience supplements',async()=>{
    const before='参与校园项目,负责需求工作,个人交付未梳理。';
    (resumeTaskInput as jest.Mock).mockResolvedValueOnce({opportunity_id:'opp-1',answers:[{sourceExcerpt:before,answer:'我整理了需求清单。',claimId:'claim-1'}]});
    const skill=JSON.stringify({changes:[{before:'使用 Excel 整理资料',after:'- 使用 Excel\n- 整理资料',sourceIds:['claim-1']}]});
    (callLLM as jest.Mock).mockResolvedValueOnce(skill).mockResolvedValueOnce(skill);
    const response=await POST(new Request('https://example.com/api/coach/resume-draft',{method:'POST',body:JSON.stringify({opportunityId:'opp-1',resumeText:before+'\n使用 Excel 整理资料',mode:'general_resume',resumeTaskId:'task',resumeTaskLease:'lease'})}));
    expect(response.status).toBe(422);expect(callLLM).toHaveBeenCalledTimes(2);expect(createArtifactWithClaims).not.toHaveBeenCalled();expect(finalizeQuota).toHaveBeenCalledWith(expect.anything(),false);
    expect(await response.json()).toMatchObject({reasonCode:'resume_draft_unverified',retryable:true});
  });

  test('guided task repairs one rejected draft within the same quota reservation',async()=>{
    (resumeTaskInput as jest.Mock).mockResolvedValueOnce({opportunity_id:'opp-1',answers:[]});
    (callLLM as jest.Mock).mockResolvedValueOnce(JSON.stringify({changes:[{before:'负责模型评测',after:'主导模型评测全流程',sourceIds:['claim-1']}]}))
      .mockResolvedValueOnce(JSON.stringify({changes:[{before:'负责模型评测',after:'模型评测覆盖准确率口径',sourceIds:['claim-1']}]}))
      .mockResolvedValueOnce(JSON.stringify({status:'passed', valueChecks: usefulValueChecks,findings:[]}));
    (applyResumeChanges as jest.Mock).mockReturnValue({text:'模型评测覆盖准确率口径',findings:[]});(reviewAtsText as jest.Mock).mockReturnValue({ok:true,coverage:1,findings:[]});(createArtifactWithClaims as jest.Mock).mockResolvedValue({id:'art',version:1});(recordArtifactReview as jest.Mock).mockResolvedValue({});
    const response=await POST(new Request('https://example.com/api/coach/resume-draft',{method:'POST',body:JSON.stringify({opportunityId:'opp-1',resumeText:'负责模型评测',mode:'general_resume',resumeTaskId:'task',resumeTaskLease:'lease'})}));
    expect(response.status).toBe(200);expect(callLLM).toHaveBeenCalledTimes(3);expect(reserveQuota).toHaveBeenCalledTimes(1);expect(finalizeQuota).toHaveBeenCalledTimes(1);expect(finalizeQuota).toHaveBeenCalledWith(expect.anything(),true);
    expect(JSON.stringify((callLLM as jest.Mock).mock.calls[1][0])).toContain('上一版未通过校验');
    const reviewMessages=(callLLM as jest.Mock).mock.calls[2][0] as Array<{role:string;content:string}>;
    expect(reviewMessages[0].content).toContain('"valueChecks"');
    const reviewData=JSON.parse(reviewMessages.find(message=>message.content.includes('待审修改（'))!.content.split('：\n').at(-1)!);
    expect(reviewData[0].sourceIds).toEqual(['claim-1']);
  });

  test('guided repair is capped and still refunds when both drafts are unsafe',async()=>{
    (resumeTaskInput as jest.Mock).mockResolvedValueOnce({opportunity_id:'opp-1',answers:Array.from({length:5},()=>({answer:'不知道',skipped:true}))});
    const unsafe=JSON.stringify({changes:[{before:'负责模型评测',after:'主导模型评测全流程',sourceIds:['claim-1']}]});
    (callLLM as jest.Mock).mockResolvedValueOnce(unsafe).mockResolvedValueOnce(unsafe);
    const response=await POST(new Request('https://example.com/api/coach/resume-draft',{method:'POST',body:JSON.stringify({opportunityId:'opp-1',resumeText:'负责模型评测',mode:'general_resume',resumeTaskId:'task',resumeTaskLease:'lease'})}));
    expect(response.status).toBe(422);expect(callLLM).toHaveBeenCalledTimes(2);expect(reserveQuota).toHaveBeenCalledTimes(1);expect(finalizeQuota).toHaveBeenCalledWith(expect.anything(),false);
  });

  test('review repair retains source-protection feedback from candidates filtered before review',async()=>{
    (resumeTaskInput as jest.Mock).mockResolvedValue({opportunity_id:'opp-1',answers:[]});
    (callLLM as jest.Mock).mockResolvedValueOnce(JSON.stringify({changes:[
      {before:'课程项目：负责模型评测',after:'模型评测覆盖准确率口径',sourceIds:['claim-1']},
      {before:'负责数据评测',after:'数据评测覆盖准确率口径',sourceIds:['claim-1']},
    ]})).mockImplementationOnce(async(messages:Array<{content:string}>)=>{
      const candidates=JSON.parse(messages.find(item=>item.content.includes('待审修改（'))!.content.split('：\n').at(-1)!);
      return JSON.stringify({status:'passed',findings:[],valueChecks:candidates.map((_item:unknown,index:number)=>({index,useful:false,kind:'clarity',reason:'这处改写没有带来明确的编辑改善'}))});
    }).mockResolvedValue(JSON.stringify({status:'failed',changes:[]}));
    await POST(new Request('https://example.com',{method:'POST',body:JSON.stringify({opportunityId:'opp-1',resumeText:'课程项目：负责模型评测\n负责数据评测',mode:'general_resume',resumeTaskId:'task',resumeTaskLease:'lease'})}));
    expect(JSON.stringify((callLLM as jest.Mock).mock.calls[2][0])).toContain('不能去掉原文的虚构、示例或练习性质标记');
  });

  test('same source paragraph split into two bullets is reviewed as one applicable edit',async()=>{
    (callLLM as jest.Mock).mockResolvedValueOnce(JSON.stringify({changes:[{before:'负责模型评测',after:'整理模型评测的准确率记录',sourceIds:['claim-1']},{before:'负责模型评测',after:'交付模型评测记录表',sourceIds:['claim-1']}]})).mockResolvedValueOnce(JSON.stringify({status:'passed', valueChecks: usefulValueChecks,findings:[]}));
    (applyResumeChanges as jest.Mock).mockReturnValue({text:'合并后预览',findings:[]});(reviewAtsText as jest.Mock).mockReturnValue({ok:true,coverage:1,findings:[]});
    (createArtifactWithClaims as jest.Mock).mockResolvedValue({id:'art',version:1});(recordArtifactReview as jest.Mock).mockResolvedValue({});
    const response=await POST(new Request('https://example.com/api/coach/resume-draft',{method:'POST',body:JSON.stringify({opportunityId:'opp-1',resumeText:'负责模型评测',mode:'general_resume'})}));
    const body=await response.json();expect(body.changes).toHaveLength(1);expect(body.changes[0].after).toBe('- 整理模型评测的准确率记录\n- 交付模型评测记录表');
  });

  test('an ambiguous/conflicting preview is not delivered or billed as success',async()=>{
    (callLLM as jest.Mock).mockResolvedValueOnce(JSON.stringify({changes:[{before:'负责模型评测',after:'模型评测覆盖准确率口径',sourceIds:['claim-1']}]})).mockResolvedValueOnce(JSON.stringify({status:'passed', valueChecks: usefulValueChecks,findings:[]}));
    (applyResumeChanges as jest.Mock).mockReturnValue({text:'原文',findings:[{code:'replacement_missed',severity:'error'}]});
    const response=await POST(new Request('https://example.com/api/coach/resume-draft',{method:'POST',body:JSON.stringify({opportunityId:'opp-1',resumeText:'负责模型评测',mode:'general_resume'})}));
    expect(response.status).toBe(422);expect((await response.json()).reasonCode).toBe('resume_mapping_conflict');expect(createArtifactWithClaims).not.toHaveBeenCalled();expect(finalizeQuota).toHaveBeenCalledWith(expect.anything(),false);
  });

  test('only an entirely uneditable resume asks one question after a bounded second look',async()=>{
    const resumeText='参加校园工具项目，负责需求工作，具体交付尚未梳理。';
    (resumeTaskInput as jest.Mock).mockResolvedValueOnce({opportunity_id:'opp-1',answers:[]});
    (callLLM as jest.Mock).mockResolvedValue(JSON.stringify({status:'needs_detail',changes:[],recovery:{sourceExcerpt:resumeText,field:'action',question:'你本人处理的第一份材料是什么？'}}));
    const response=await POST(new Request('https://example.com/api/coach/resume-draft',{method:'POST',body:JSON.stringify({opportunityId:'opp-1',resumeText,mode:'general_resume',resumeTaskId:'task',resumeTaskLease:'lease'})}));
    expect(response.status).toBe(422);expect((await response.json()).recovery).toMatchObject({field:'action',question:'你本人处理的第一份材料是什么？'});
    expect(callLLM).toHaveBeenCalledTimes(2);expect(createArtifactWithClaims).not.toHaveBeenCalled();expect(finalizeQuota).toHaveBeenCalledWith(expect.anything(),false);
  });

  test('saved answers enter required context and stable citations before drafting, without a readiness call',async()=>{
    const resumeText='参加校园工具项目，负责需求工作，具体交付尚未梳理。';
    const answer={id:'action',field:'action',sourceExcerpt:resumeText,question:'你本人做了什么？',answer:'我整理了访谈记录。',claimId:'8c47df93-0984-468b-bb56-30a387f670fe'};
    (resumeTaskInput as jest.Mock).mockResolvedValueOnce({opportunity_id:'opp-1',answers:[answer]});
    (persistResumeAnswerClaims as jest.Mock).mockResolvedValueOnce([{id:answer.claimId,displayText:answer.answer}]);
    (callLLM as jest.Mock).mockResolvedValue(JSON.stringify({status:'needs_detail',changes:[],recovery:{sourceExcerpt:resumeText,field:'deliverable',question:'你最后交付的那份材料叫什么？'}}));
    const response=await POST(new Request('https://example.com/api/coach/resume-draft',{method:'POST',body:JSON.stringify({opportunityId:'opp-1',resumeText,mode:'general_resume',resumeTaskId:'task',resumeTaskLease:'lease'})}));
    expect(response.status).toBe(422);expect((await response.json()).recovery.field).toBe('deliverable');
    expect(compileContextBundle).toHaveBeenCalledWith(expect.objectContaining({attachments:[expect.objectContaining({text:answer.answer,required:true})],claims:[expect.objectContaining({id:answer.claimId})]}));
    expect(JSON.stringify((callLLM as jest.Mock).mock.calls[0][0])).toContain(answer.answer);
  });

  test('a weak paragraph does not block safe edits elsewhere; one optional question accompanies the saved draft',async()=>{
    const weak='参与校园工具项目，负责需求相关工作，具体交付还没梳理。';
    (resumeTaskInput as jest.Mock).mockResolvedValueOnce({opportunity_id:'opp-1',answers:[]});
    (callLLM as jest.Mock).mockResolvedValueOnce(JSON.stringify({changes:[{before:'负责模型评测',after:'模型评测覆盖准确率口径',sourceIds:['claim-1']}],recovery:{sourceExcerpt:weak,field:'action',question:'这段项目里你本人实际做过哪一步？'}}))
      .mockResolvedValueOnce(JSON.stringify({status:'passed', valueChecks: usefulValueChecks,findings:[]}));
    (applyResumeChanges as jest.Mock).mockReturnValue({text:'已改稿',findings:[]});(reviewAtsText as jest.Mock).mockReturnValue({ok:true,coverage:0,findings:[]});
    (createArtifactWithClaims as jest.Mock).mockResolvedValue({id:'art',version:1});(recordArtifactReview as jest.Mock).mockResolvedValue({});
    const response=await POST(new Request('https://example.com/api/coach/resume-draft',{method:'POST',body:JSON.stringify({opportunityId:'opp-1',resumeText:'负责模型评测\n'+weak,mode:'general_resume',resumeTaskId:'task',resumeTaskLease:'lease'})}));
    expect(response.status).toBe(200);expect(await response.json()).toMatchObject({ok:true,changes:[expect.anything()],followUp:{field:'action',sourceExcerpt:weak}});
    expect(callLLM).toHaveBeenCalledTimes(2);expect(createArtifactWithClaims).toHaveBeenCalledTimes(1);expect(finalizeQuota).toHaveBeenCalledWith(expect.anything(),true);
  });

  test('an overcautious first detail request is rechecked against the whole resume before blocking',async()=>{
    const weak='参与校园工具项目，负责需求相关工作，具体交付还没梳理。';
    (resumeTaskInput as jest.Mock).mockResolvedValueOnce({opportunity_id:'opp-1',answers:[]});
    (callLLM as jest.Mock).mockResolvedValueOnce(JSON.stringify({status:'needs_detail',changes:[],recovery:{sourceExcerpt:weak,field:'action',question:'你本人实际做了什么？'}}))
      .mockResolvedValueOnce(JSON.stringify({changes:[{before:'负责模型评测',after:'模型评测覆盖准确率口径',sourceIds:['claim-1']}]}))
      .mockResolvedValueOnce(JSON.stringify({status:'passed', valueChecks: usefulValueChecks,findings:[]}));
    (applyResumeChanges as jest.Mock).mockReturnValue({text:'已改稿',findings:[]});(reviewAtsText as jest.Mock).mockReturnValue({ok:true,coverage:0,findings:[]});
    (createArtifactWithClaims as jest.Mock).mockResolvedValue({id:'art',version:1});(recordArtifactReview as jest.Mock).mockResolvedValue({});
    const response=await POST(new Request('https://example.com/api/coach/resume-draft',{method:'POST',body:JSON.stringify({opportunityId:'opp-1',resumeText:'负责模型评测\n'+weak,mode:'general_resume',resumeTaskId:'task',resumeTaskLease:'lease'})}));
    expect(response.status).toBe(200);expect(callLLM).toHaveBeenCalledTimes(3);expect(finalizeQuota).toHaveBeenCalledTimes(1);expect(finalizeQuota).toHaveBeenCalledWith(expect.anything(),true);
  });

  test("identity cleanup and removal of a fictitious label are blocked before paid review", async () => {
    (callLLM as jest.Mock).mockResolvedValueOnce(JSON.stringify({changes:[{section:"姓名栏",before:"林补充（虚构 QA）",after:"林补充",reason:"精简",sourceIds:["claim-1"]}]}));
    const response=await POST(new Request("https://example.com/api/coach/resume-draft",{method:"POST",body:JSON.stringify({opportunityId:"opp-1",resumeText:"林补充（虚构 QA）\n负责模型评测",mode:"general_resume"})}));
    expect(response.status).toBe(422);expect(callLLM).toHaveBeenCalledTimes(1);
    expect(createArtifactWithClaims).not.toHaveBeenCalled();expect(finalizeQuota).toHaveBeenCalledWith(expect.anything(),false);
  });

  test("one anchored question is returned before review and quota is released", async () => {
    const resumeText = "协助整理客服工单，参与需求讨论，但原材料还未说明具体交付";
    (callLLM as jest.Mock).mockResolvedValueOnce(JSON.stringify({ status: "needs_detail", changes: [], recovery: {
      sourceExcerpt: resumeText, question: "整理这批工单时，你本人最后交付了什么材料？",
    } }));
    const response = await POST(new Request("https://example.com/api/coach/resume-draft", { method: "POST", body: JSON.stringify({ opportunityId: "opp-1", resumeText, mode: "general_resume" }) }));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({reasonCode:"resume_detail_needed", recovery:{sourceExcerpt:resumeText,question:expect.stringContaining("交付")}});
    expect(callLLM).toHaveBeenCalledTimes(1);
    expect(finalizeQuota).toHaveBeenCalledWith(expect.anything(), false);
    expect(createArtifactWithClaims).not.toHaveBeenCalled();
    expect((await (startResumeTrace as jest.Mock).mock.results[0].value).finish).toHaveBeenCalledWith("needs_detail");
  });

  test("a saved detail is not requested again, internal trace is absent from the response", async () => {
    const source = "协助整理客服工单，参与需求讨论，但原材料还未说明具体交付";
    const resumeText = `${source}\n\n补充经历（用户提供，待核实）：\n我整理了三类工单分类表，没有参与上线。`;
    (callLLM as jest.Mock).mockResolvedValueOnce(JSON.stringify({status:"needs_detail",changes:[],recovery:{sourceExcerpt:source,question:"整理这批工单时，你本人最后交付了什么材料？"}}));
    const response = await POST(new Request("https://example.com/api/coach/resume-draft",{method:"POST",body:JSON.stringify({opportunityId:"opp-1",resumeText,mode:"general_resume"})}));
    const result = await response.json();
    expect(result.recovery.detailSaved).toBe(true);
    expect(result.recovery.question).toContain("不需要反复补");
    expect(JSON.stringify(result)).not.toMatch(/requestHash|similarity|draft_quality_not_candidate/);
  });

  test("an unavailable audit store fails before reserve or model invocation", async () => {
    (startResumeTrace as jest.Mock).mockRejectedValueOnce(Error("RESUME_TRACE_UNAVAILABLE"));
    const response = await POST(new Request("https://example.com/api/coach/resume-draft",{method:"POST",body:JSON.stringify({resumeText:"真实简历",mode:"general_resume"})}));
    expect(response.status).toBe(503);
    expect(reserveQuota).not.toHaveBeenCalled(); expect(callLLM).not.toHaveBeenCalled();
  });

  test("general résumé can be rewritten and saved without a target JD",async()=>{
    (callLLM as jest.Mock).mockResolvedValueOnce(JSON.stringify({changes:[{section:"项目经历",before:"负责模型评测",after:"模型评测覆盖准确率口径",reason:"明确动作",sourceIds:["claim-1"]}]}))
      .mockResolvedValueOnce(JSON.stringify({status:"passed", valueChecks: usefulValueChecks,summary:"事实与短句通过",findings:[]}));
    (applyResumeChanges as jest.Mock).mockReturnValue({text:"模型评测覆盖准确率口径",findings:[]});
    (reviewAtsText as jest.Mock).mockReturnValue({ok:true,coverage:0,findings:[]});
    (createArtifactWithClaims as jest.Mock).mockResolvedValue({id:"general-art",version:1});
    (recordArtifactReview as jest.Mock).mockResolvedValue({reviewer_type:"facts",summary:"ok",findings:[]});
    const response=await POST(new Request("https://example.com/api/coach/resume-draft",{method:"POST",body:JSON.stringify({opportunityId:"opp-1",resumeText:"AI Job Coach：负责模型评测",jobDescription:"",mode:"general_resume"})}));
    expect(response.status).toBe(200);
    expect((await response.json()).changes).toHaveLength(1);
    expect(createArtifactWithClaims).toHaveBeenCalledWith(expect.objectContaining({title:"简历修改候选版本"}));
    expect(JSON.stringify((callLLM as jest.Mock).mock.calls[0][0])).toContain("没有目标 JD");
    expect(finalizeQuota).toHaveBeenCalledWith(expect.anything(),true);
    expect(runWithGenerationContext).toHaveBeenCalledWith(expect.objectContaining({userId:"user-1",operation:"resume_review"}),expect.any(Function));
    expect((callLLM as jest.Mock).mock.calls[1][1]).toMatchObject({maxTokens:2200,reasoningBudgetTokens:4096,maxRetries:0});
  });

  test("model exhaustion preserves source and refunds with an actionable message",async()=>{
    (callLLM as jest.Mock).mockRejectedValue(new Error("Empty response from LLM (finish_reason=length)"));
    const response=await POST(new Request("https://example.com/api/coach/resume-draft",{method:"POST",body:JSON.stringify({opportunityId:"opp-1",resumeText:"负责模型评测",mode:"general_resume"})}));
    expect(response.status).toBe(503);expect(await response.json()).toMatchObject({reasonCode:"model_response_incomplete",retryable:true,error:expect.stringContaining("未扣额度")});
    expect(finalizeQuota).toHaveBeenCalledWith(expect.anything(),false);expect(createArtifactWithClaims).not.toHaveBeenCalled();
  });

  test("rejects suggestions whose before is a section label instead of exact resume text", async () => {
    (callLLM as jest.Mock).mockResolvedValue(JSON.stringify({ changes: [{
      section: "项目经历", before: "项目经历 > AI Job Coach", after: "主导 AI Job Coach", reason: "岗位匹配", sourceIds: ["claim-1"],
    }] }));
    const response = await POST(new Request("http://localhost/api/coach/resume-draft", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opportunityId: "opp-1", resumeText: "AI Job Coach：负责模型评测", jobDescription: "负责 AI 产品评测" }),
    }));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ ok: false, reasonCode: "resume_draft_unverified", error: expect.stringContaining("未通过事实校验"), recovery: { sourceExcerpt: "AI Job Coach：负责模型评测", question: expect.stringContaining("你本人具体做了哪一步") } }));
    expect(createArtifactWithClaims).not.toHaveBeenCalled();
    expect(finalizeQuota).toHaveBeenCalledWith(expect.anything(), false);
    expect(getContextBundleForUser).toHaveBeenCalledWith(expect.objectContaining({
      opportunityId: "opp-1",
      questionSource: { id: "base-resume", text: "AI Job Coach：负责模型评测" },
    }));
  });

  test("rejects suggestions whose after ends with a dangling tail (半截话)", async () => {
    (callLLM as jest.Mock).mockResolvedValue(JSON.stringify({ changes: [{
      section: "项目经历", before: "负责模型评测", after: "负责模型评测，覆盖准确率、", reason: "岗位匹配", sourceIds: ["claim-1"],
    }] }));
    const response = await POST(new Request("http://localhost/api/coach/resume-draft", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opportunityId: "opp-1", resumeText: "AI Job Coach：负责模型评测", jobDescription: "负责 AI 产品评测" }),
    }));

    expect(response.status).toBe(422);
    expect(finalizeQuota).toHaveBeenCalledWith(expect.anything(), false);
  });

  test("引用回指守卫把残缺与夸大动作的建议确定性拦下，不再为它们花一次质检调用", async () => {
    (callLLM as jest.Mock).mockResolvedValue(JSON.stringify({ changes: [
      { section: "项目经历", before: "AI Job Coach：负责模型评测", after: "AI Job Coach 约30用户，腾活约10，已上线腾", reason: "量化", sourceIds: ["claim-1"] },
      { section: "项目经历", before: "负责模型评测", after: "主导模型评测全流程", reason: "岗位匹配", sourceIds: ["claim-1"] },
    ] }));
    const response = await POST(new Request("http://localhost/api/coach/resume-draft", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opportunityId: "opp-1", resumeText: "AI Job Coach：负责模型评测", jobDescription: "负责 AI 产品评测" }),
    }));

    expect(response.status).toBe(422);
    // 「已上线」在来源里没有逐字依据、「主导」把职责写大了——两类都是 R-3 点名的形状，
    // 守卫给 block；起草那次调用之后就不该再花付费质检（callLLM 只跑 1 次）。
    expect(callLLM).toHaveBeenCalledTimes(1);
    expect(finalizeQuota).toHaveBeenCalledWith(expect.anything(), false);
  });

  test("reviewer error finding on a real changeId removes that suggestion only", async () => {
    // 两条都是「换措辞」类：守卫只给 annotate（见 spec §10 的两档裁定），所以都能进质检。
    // 语义上的扩大（凭空加「幻觉率」口径）只有质检员看得出来，由它摘掉那一条。
    const overClaim = { section: "项目经历", before: "负责模型评测", after: "独立完成模型评测方案，覆盖准确率与幻觉率两个口径", reason: "量化", sourceIds: ["claim-1"] };
    const reworded = { section: "项目经历", before: "AI Job Coach：负责模型评测", after: "模型评测覆盖准确率口径", reason: "岗位匹配", sourceIds: ["claim-1"] };
    (callLLM as jest.Mock)
      .mockResolvedValueOnce(JSON.stringify({ changes: [overClaim, reworded] }))
      .mockImplementationOnce(async (messages: { role: string; content: string }[]) => {
        // 质检 prompt 末尾带「待审修改」JSON，从中取服务端真实生成的 changeId，
        // 只对凭空加口径那条回 error。
        const prompt = messages.find(message=>message.content.includes("待审修改（"))!.content;
        const list = JSON.parse(prompt.slice(prompt.indexOf("[", prompt.indexOf("待审修改")))) as { id: string; after: string }[];
        const badId = list.find((c) => c.after.includes("幻觉率"))?.id;
        return JSON.stringify({ status: "failed", valueChecks: usefulValueChecks, summary: "一条凭空加了口径", findings: [{ changeId: badId, severity: "error", message: "来源里没有幻觉率口径" }] });
      });
    (applyResumeChanges as jest.Mock).mockImplementation((_text: string, changes: unknown[]) => ({ text: `preview:${(changes as { after: string }[]).length}`, findings: [] }));
    (reviewAtsText as jest.Mock).mockReturnValue({ ok: true, coverage: 1, findings: [] });
    (createArtifactWithClaims as jest.Mock).mockResolvedValue({ id: "art-1", version: 1 });
    (recordArtifactReview as jest.Mock).mockResolvedValue({ reviewer_type: "facts", summary: "ok", findings: [] });

    const response = await POST(new Request("http://localhost/api/coach/resume-draft", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opportunityId: "opp-1", resumeText: "AI Job Coach：负责模型评测", jobDescription: "负责 AI 产品评测" }),
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.changes).toHaveLength(1);
    expect(body.changes[0].after).toContain("准确率口径");
    expect(body.rejectedCount).toBe(1);
    // 台账记下两条都被核验过、都只判 annotate：拦截的是质检员，不是守卫。
    expect(body.guards).toEqual([
      expect.objectContaining({ index: 0, outcome: "annotate", code: "citation_no_exact_substring" }),
      expect.objectContaining({ index: 1, outcome: "annotate", code: "citation_no_exact_substring" }),
    ]);
    // 下发给质检后仍保留的建议才进入 preview/artifact：宁缺毋滥但不误伤好建议。
    expect(applyResumeChanges).toHaveBeenCalledWith(expect.any(String), [expect.objectContaining({ after: expect.stringContaining("准确率口径") })]);
    expect(finalizeQuota).toHaveBeenCalledWith(expect.anything(), true);
  });

  test("failed overall review with warning-level fabricated responsibility is refunded, not delivered", async () => {
    (callLLM as jest.Mock).mockResolvedValueOnce(JSON.stringify({ changes: [{ section: "经历", before: "负责模型评测", after: "模型评测覆盖准确率口径", reason: "岗位匹配", sourceIds: ["claim-1"] }] }))
      .mockImplementationOnce(async (messages: { content: string }[]) => {
        const prompt = messages.find(message=>message.content.includes("待审修改（"))!.content;
        const changes = JSON.parse(prompt.slice(prompt.indexOf("[", prompt.indexOf("待审修改"))));
        return JSON.stringify({ status: "failed", valueChecks: usefulValueChecks, summary: "扩大职责", findings: [{ changeId: changes[0].id, severity: "warning", message: "增加了未提供的指标责任" }] });
      });
    const response = await POST(new Request("http://localhost/api/coach/resume-draft", { method: "POST", body: JSON.stringify({ opportunityId: "opp-1", resumeText: "AI Job Coach：负责模型评测", jobDescription: "负责 AI 产品评测" }) }));
    expect(response.status).toBe(422);
    expect((await response.json()).recovery.question).toContain("你本人");
    expect(createArtifactWithClaims).not.toHaveBeenCalled();
    expect(finalizeQuota).toHaveBeenCalledWith(expect.anything(), false);
  });

  test("discarded proposals do not fail the factual review of the retained artifact", async () => {
    (callLLM as jest.Mock).mockResolvedValueOnce(JSON.stringify({ changes: [
      { before: "不存在的原文", after: "负责不存在的工作", sourceIds: ["claim-1"] },
      { before: "负责模型评测", after: "模型评测覆盖准确率口径", sourceIds: ["claim-1"] },
    ] })).mockResolvedValueOnce(JSON.stringify({ status: "passed", valueChecks: usefulValueChecks, summary: "保留项通过", findings: [] }));
    (applyResumeChanges as jest.Mock).mockReturnValue({ text: "保留项预览", findings: [] });
    (reviewAtsText as jest.Mock).mockReturnValue({ ok: true, coverage: 1, findings: [] });
    (createArtifactWithClaims as jest.Mock).mockResolvedValue({ id: "art-1", version: 1 });
    (recordArtifactReview as jest.Mock).mockResolvedValue({ reviewer_type: "facts", status: "passed" });
    const response = await POST(new Request("http://localhost/api/coach/resume-draft", { method: "POST", body: JSON.stringify({ opportunityId: "opp-1", resumeText: "AI Job Coach：负责模型评测", jobDescription: "负责 AI 产品评测" }) }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.rejectedCount).toBe(1);
    expect(body.applicationQuality.status).toBe("ready");
    expect(recordArtifactReview).toHaveBeenCalledWith(expect.objectContaining({ reviewerType: "facts", status: "passed", findings: [] }));
    expect(createArtifactWithClaims).toHaveBeenCalledWith(expect.objectContaining({ content: expect.objectContaining({ discardedSuggestions: [expect.objectContaining({ index: 0 })] }) }));
  });
});

describe("isTrivialRewrite (同义换词不进确认列表)", () => {
  it("仅换一两个字的润色视为无信息增量", () => {
    expect(isTrivialRewrite("擅长把模糊需求拆成知识组织与评测流程", "擅长把模糊需求拆解为知识组织与评测流程")).toBe(true);
    expect(isTrivialRewrite("负责一个 AI 项目的产品落地", "负责一个AI项目的产品落地")).toBe(true);
  });
  it("带来结构或信息变化的改写不算 trivial", () => {
    expect(isTrivialRewrite(
      "做过模型评测工作",
      "独立完成 3 个 LLM 场景的评测方案设计，覆盖准确率与幻觉率，评测周期从 2 周压缩到 3 天",
    )).toBe(false);
  });
});
