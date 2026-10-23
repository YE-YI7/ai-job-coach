import { POST } from "./route";
import { runResumeDraft } from "@/lib/coach-harness/resume-execution";
import { isTrivialRewrite } from "@/lib/coach-harness/resume-diff";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { callLLM } from "@/lib/llm";
import { finalizeQuota, reserveQuota, reserveResumeTrial } from "@/lib/quota";
import { applyResumeChanges, reviewAtsText, compileContextBundle } from "@/lib/coach-harness";
import { resumeTaskInput, persistResumeAnswerClaims,persistResumeTrialClaims,ownedResumeTaskSource,finishResumeTask } from "@/lib/coach-harness/resume-task";
import { createArtifactWithClaims, getContextBundleForUser, recordArtifactReview } from "@/lib/coach-harness/repository";
import {runWithGenerationContext} from "@/lib/generation-context";
import {startResumeTrace} from "@/lib/coach-harness/resume-trace";
import { RESUME_METHOD_IDS } from "@/lib/knowledge/resume-methods";

jest.mock("@/lib/auth");
jest.mock("@/lib/llm");
jest.mock("@/lib/quota");
jest.mock("@/lib/coach-harness/resume-task");
jest.mock("@/lib/coach-harness/resume-trace", () => ({ startResumeTrace: jest.fn(),readResumeTrace:jest.fn().mockResolvedValue(null) }));
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

// Legacy per-change tests explicitly supply a passing document verdict; new
// document-review tests below exercise missing/failed whole-document judgments.
const passedDocument={status:"passed",summary:"整稿一致，未发现本轮引入的新问题",findings:[]};
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
    (applyResumeChanges as jest.Mock).mockReturnValue({text:"原文",findings:[]});
    (persistResumeAnswerClaims as jest.Mock).mockResolvedValue([]);
    (persistResumeTrialClaims as jest.Mock).mockResolvedValue([]);
    (startResumeTrace as jest.Mock).mockResolvedValue({ data: {}, step: jest.fn(), finish: jest.fn().mockResolvedValue(undefined) });
    (getContextBundleForUser as jest.Mock).mockResolvedValue({
      allowedClaimIds: ["claim-1"], unverifiedClaimIds: [], selection: { included: [], excluded: [] },
      budget: { maxInputTokens: 12_000 }, usage: { truncated: false }, claims: [], artifacts: [], knowledge: [], attachments: [],
    });
  });

  afterEach(() => jest.restoreAllMocks());

  const trialResume='姓名：虚构同学\n实习经历\n2025.01-2025.03 甲门店 运营实习\n核对退货原因，把记录整理成分类表，交给店长每周查看。\n\n2025.04-2025.06 乙门店 运营实习\n整理库存记录，交给同事核对。';
  async function trialRequest(){
    const {resumeTrialTargets}=await import('@/lib/resume-experience-trial');const target=resumeTrialTargets(trialResume)[0];
    (resumeTaskInput as jest.Mock).mockResolvedValue({opportunity_id:'opp-1',answers:[],edit_scope:target});
    (ownedResumeTaskSource as jest.Mock).mockResolvedValue({resume:trialResume,jd:'',revision:'r',changes:[]});
    const {compileContextBundle:compile}=jest.requireActual('@/lib/coach-harness/context');
    (compileContextBundle as jest.Mock).mockImplementation(input=>compile(input));
    return new Request('https://example.com',{method:'POST',body:JSON.stringify({opportunityId:'opp-1',resumeTaskId:'task',resumeTaskLease:'lease',resumeText:trialResume,mode:'general_resume'})});
  }
  test('a used trial never spends paid quota or calls a model',async()=>{
    (reserveResumeTrial as jest.Mock).mockResolvedValue(null);
    expect((await POST(await trialRequest())).status).toBe(403);
    expect(reserveQuota).not.toHaveBeenCalled();expect(callLLM).not.toHaveBeenCalled();expect(createArtifactWithClaims).not.toHaveBeenCalled();
  });
  test('trial only admits selected facts, uses site model and refunds a timeout',async()=>{
    (reserveResumeTrial as jest.Mock).mockResolvedValue({id:'trial-r',source:'resume_experience_trial',remaining:0});
    (callLLM as jest.Mock).mockRejectedValue(new Error('LLM_REQUEST_TIMEOUT'));
    expect((await POST(await trialRequest())).status).toBe(503);
    expect(getContextBundleForUser).not.toHaveBeenCalled();expect(reserveQuota).not.toHaveBeenCalled();
    const prompts=JSON.stringify((callLLM as jest.Mock).mock.calls[0][0]);expect(prompts).toContain('甲门店');expect(prompts).not.toContain('乙门店');
    expect((callLLM as jest.Mock).mock.calls[0][1]).toMatchObject({timeoutMs:75000,firstTokenTimeoutMs:30000,maxRetries:0,onDelta:expect.any(Function)});
    expect((runWithGenerationContext as jest.Mock).mock.calls[0][0].userId).toBe('user-1');
    expect((callLLM as jest.Mock).mock.calls[0][1].siteFunded).toBe(true);
    expect(finalizeQuota).toHaveBeenCalledWith(expect.objectContaining({id:'trial-r'}),false);expect(createArtifactWithClaims).not.toHaveBeenCalled();
  });
  test('model proposing an edit in another experience cannot create a free artifact',async()=>{
    (reserveResumeTrial as jest.Mock).mockResolvedValue({id:'trial-r',source:'resume_experience_trial',remaining:0});
    (callLLM as jest.Mock).mockResolvedValue(JSON.stringify({changes:[{before:'整理库存记录，交给同事核对。',after:'整理库存记录供同事核对。',sourceIds:['claim-1']}]}));
    const response=await POST(await trialRequest());expect(response.ok).toBe(false);expect(createArtifactWithClaims).not.toHaveBeenCalled();expect(finalizeQuota).toHaveBeenCalledWith(expect.objectContaining({id:'trial-r'}),false);
  });

  test.each(["opp-1", ""])("no-JD draft includes reviewed methods with opportunity %s", async opportunityId => {
    // Use the real compiler here so the direct/no-opportunity branch is covered.
    const { compileContextBundle: realCompile } = jest.requireActual("@/lib/coach-harness/context");
    (compileContextBundle as jest.Mock).mockImplementation(input => realCompile({ task: "resume_workshop", userId: "user-1", claims: [], ...input }));
    (callLLM as jest.Mock).mockRejectedValueOnce(new Error("isolated transport fixture"));
    await POST(new Request("https://example.com", {method:"POST",body:JSON.stringify({ opportunityId, resumeText:"门店运营：核对库存差异，整理盘点表交给店长。", mode:"general_resume" })}));
    const prompt = JSON.stringify((callLLM as jest.Mock).mock.calls[0][0]);
    for (const id of RESUME_METHOD_IDS) expect(prompt).toContain(`[参考 ${id}]`);
    expect(prompt).toContain("不是用户事实");
    const trace = await (startResumeTrace as jest.Mock).mock.results[0].value;
    expect(trace.data.retrieval.includedMethodIds).toEqual(RESUME_METHOD_IDS);
    expect(trace.data.retrieval.matches).toEqual([]);
  });

  test("budget-excluded methods never return through prompts or telemetry", async () => {
    (compileContextBundle as jest.Mock).mockImplementation(input => ({...input, knowledge:[]}));
    (callLLM as jest.Mock).mockRejectedValueOnce(new Error("isolated transport fixture"));
    await POST(new Request("https://example.com", {method:"POST",body:JSON.stringify({ opportunityId:"opp-1", resumeText:"门店运营：核对库存差异。", mode:"general_resume" })}));
    const prompt = JSON.stringify((callLLM as jest.Mock).mock.calls[0][0]);
    for (const id of RESUME_METHOD_IDS) expect(prompt).not.toContain(id);
    expect((runWithGenerationContext as jest.Mock).mock.calls[0][0].knowledgeDocumentIds).toEqual([]);
    const trace = await (startResumeTrace as jest.Mock).mock.results[0].value;
    expect(trace.data.retrieval.includedMethodIds).toEqual([]);
    expect(trace.data.retrieval.excludedByBudgetIds).toEqual(RESUME_METHOD_IDS);
  });

  test("draft and independent reviewer receive the same admitted methods", async () => {
    (callLLM as jest.Mock).mockResolvedValueOnce(JSON.stringify({changes:[{before:'负责模型评测',after:'模型评测覆盖准确率口径',sourceIds:['claim-1']}]}))
      .mockResolvedValueOnce(JSON.stringify({document:passedDocument,status:'passed', valueChecks: usefulValueChecks,findings:[]}));
    (applyResumeChanges as jest.Mock).mockReturnValue({text:'模型评测覆盖准确率口径',findings:[]});
    (reviewAtsText as jest.Mock).mockReturnValue({ok:true,coverage:0,findings:[]});
    (createArtifactWithClaims as jest.Mock).mockResolvedValue({id:'artifact-1'});
    (recordArtifactReview as jest.Mock).mockResolvedValue({});
    const response=await POST(new Request('https://example.com',{method:'POST',body:JSON.stringify({opportunityId:'opp-1',resumeText:'负责模型评测',mode:'general_resume'})}));
    expect(response.status).toBe(200);
    expect(callLLM).toHaveBeenCalledTimes(2);
    for (const [messages] of (callLLM as jest.Mock).mock.calls) {
      for (const id of RESUME_METHOD_IDS) expect(JSON.stringify(messages)).toContain(`[参考 ${id}]`);
    }
  });

  test.each([
    ['平台运营：负责社团官方平台的内容容运营，累计发布通知并整理每周阅读记录。','平台运营：负责社团官方平台的内容运营，累计发布通知并整理每周阅读记录。'],
    ['平台运营：累计发布通知，实现关注人数增长20%月平均阅读量提升15%。','平台运营：累计发布通知，实现关注人数增长20%、月平均阅读量提升15%。'],
  ])('OCR and fused metrics reach independent review despite low edit distance',async(before,after)=>{
    expect(isTrivialRewrite(before,after)).toBe(true);
    (callLLM as jest.Mock).mockResolvedValueOnce(JSON.stringify({changes:[{before,after,reason:'修复重复字或并列指标粘连，不新增任何事实',sourceIds:['claim-1']}]}))
      .mockResolvedValueOnce(JSON.stringify({status:'passed',summary:'修复文字错误，事实和结果口径保持不变',findings:[],document:passedDocument,valueChecks:[{index:0,useful:true,kind:'clarity',reason:'修复重复字或粘连指标，使原有内容清晰可读'}]}));
    (applyResumeChanges as jest.Mock).mockReturnValue({text:after,findings:[]});
    (reviewAtsText as jest.Mock).mockReturnValue({ok:true,coverage:1,findings:[]});
    (createArtifactWithClaims as jest.Mock).mockResolvedValue({id:'ocr-artifact',version:1});
    (recordArtifactReview as jest.Mock).mockResolvedValue({});
    const response=await POST(new Request('https://example.com',{method:'POST',body:JSON.stringify({opportunityId:'opp-1',resumeText:before,mode:'general_resume'})}));
    expect(response.status).toBe(200);
    expect((await response.json()).changes[0]).toMatchObject({before,after,status:'pending'});
    expect(callLLM).toHaveBeenCalledTimes(2);
    expect(JSON.stringify((callLLM as jest.Mock).mock.calls[1][0])).toContain('OCR错字');
    const trace=await(startResumeTrace as jest.Mock).mock.results[0].value;
    expect(trace.step).toHaveBeenCalledWith('grounding','similar_changes_require_review',1);
    expect(finalizeQuota).toHaveBeenCalledWith(expect.anything(),true);
  });

  test('a semantic similarity hint cannot override an independent no-value verdict',async()=>{
    const before='核对活动页面的图片与标题，记录差异并交给页面同事修改。',after='核对活动页面的图片与标题，记录差异后移交页面同事修改。';
    (callLLM as jest.Mock).mockResolvedValueOnce(JSON.stringify({changes:[{before,after,sourceIds:['claim-1']}]}))
      .mockResolvedValueOnce(JSON.stringify({status:'passed',summary:'事实未变，但只有交接动词的同义替换',findings:[],document:passedDocument,valueChecks:[{index:0,useful:false,kind:'clarity',reason:'只有交给与移交的同义替换，没有实际改善'}]}));
    (applyResumeChanges as jest.Mock).mockReturnValue({text:after,findings:[]});
    const response=await POST(new Request('https://example.com',{method:'POST',body:JSON.stringify({opportunityId:'opp-1',resumeText:before,mode:'general_resume'})}));
    expect(response.ok).toBe(false);expect(createArtifactWithClaims).not.toHaveBeenCalled();
    expect(finalizeQuota).toHaveBeenCalledWith(expect.anything(),false);
  });

  test.each([true,false])('correction-only first draft returns to editor once; substantive=%s',async(substantive)=>{
    const before='内容运营：平时负责整理店铺反馈，整理了30条反馈馈，整理后交给店长每周查看。';
    const corrected='内容运营：平时负责整理店铺反馈，整理了30条反馈，整理后交给店长每周查看。';
    const improved='内容运营：整理30条店铺反馈，交给店长每周查看。';
    (resumeTaskInput as jest.Mock).mockResolvedValue({opportunity_id:'opp-1',answers:[]});
    (ownedResumeTaskSource as jest.Mock).mockResolvedValue({resume:before,jd:'',revision:'r',changes:[]});
    (finishResumeTask as jest.Mock).mockResolvedValue({state:'ready'});
    (callLLM as jest.Mock).mockImplementation(async(messages)=>{
      const prompt=JSON.stringify(messages);
      const reviews=(callLLM as jest.Mock).mock.calls.filter(([m])=>JSON.stringify(m).includes('待审修改（')).length;
      if(prompt.includes('待审修改（'))return JSON.stringify({status:'passed',summary:'检查原文事实与表达',findings:[],document:passedDocument,valueChecks:[{index:0,useful:true,kind:reviews===2&&substantive?'concision':'clarity',impact:reviews===2&&substantive?'content':'correction',reason:reviews===2&&substantive?'精简了重复整理过程，突出交付物与用途':'只修正重复字，恢复文字可读性'}]});
      const after=reviews>0&&substantive?improved:corrected;
      return JSON.stringify({changes:[{section:'实习经历',before,after,reason:reviews>0&&substantive?'删除重复过程，保留交付与用途':'修正反馈馈错别字',sourceIds:['claim-1']}]});
    });
    (applyResumeChanges as jest.Mock).mockImplementation((_source,changes)=>({text:changes[0]?.after||before,findings:[]}));
    (reviewAtsText as jest.Mock).mockReturnValue({ok:true,coverage:1,findings:[]});
    (createArtifactWithClaims as jest.Mock).mockResolvedValue({id:'quality-artifact',version:1});
    (recordArtifactReview as jest.Mock).mockResolvedValue({});
    const response=await POST(new Request('https://example.com',{method:'POST',body:JSON.stringify({opportunityId:'opp-1',resumeTaskId:'task',resumeTaskLease:'lease',resumeText:before,mode:'general_resume'})}));
    const body=await response.json();expect(response.status).toBe(200);
    expect(callLLM).toHaveBeenCalledTimes(4);
    expect(body.changes[0].after).toBe(substantive?improved:corrected);
    if(substantive){expect(body.partial).not.toBe(true);expect(body.reasonCode).toBeUndefined();}
    else{expect(body).toMatchObject({partial:true,reasonCode:'resume_correction_only'});expect(body.summary).toContain('尚未完成内容优化');}
    const trace=await(startResumeTrace as jest.Mock).mock.results[0].value;
    expect(trace.step).toHaveBeenCalledWith('review','correction_only_returned_to_editor',1);
    expect(finishResumeTask).toHaveBeenCalledWith('user-1','task','lease',expect.anything(),expect.objectContaining(substantive?{ok:true}:{partial:true,reasonCode:'resume_correction_only'}));
  });

  test('rejected content with only tiny surviving polish cannot skip the bounded editor repair',async()=>{
    const before='内容运营：平时负责整理店铺反馈，整理了30条反馈，整理后交给店长每周查看。';
    const skill='掌握Excel筛选和透视表。';
    const improved='内容运营：整理30条店铺反馈，交给店长每周查看。';
    (resumeTaskInput as jest.Mock).mockResolvedValue({opportunity_id:'opp-1',answers:[]});
    (ownedResumeTaskSource as jest.Mock).mockResolvedValue({resume:before+'\n'+skill,jd:'',revision:'r',changes:[]});
    (finishResumeTask as jest.Mock).mockResolvedValue({state:'ready'});
    let drafts=0;
    (callLLM as jest.Mock).mockImplementation(async(messages)=>{
      if(JSON.stringify(messages).includes('待审修改（'))return JSON.stringify({status:'passed',summary:'逐条检查完成',findings:[],document:passedDocument,valueChecks:[{index:0,useful:true,kind:'concision',impact:'content',reason:'精简重复整理过程，保留本人动作和交付'}]});
      drafts++;
      return JSON.stringify({changes:drafts===1?[{before,after:before.replace('平时',''),sourceIds:['claim-1']},{before:skill,after:skill.replace('和','与'),sourceIds:['claim-1']}]:[{before,after:improved,sourceIds:['claim-1']}]});
    });
    (applyResumeChanges as jest.Mock).mockImplementation((_source,changes)=>({text:changes[0]?.after||before,findings:[]}));
    (reviewAtsText as jest.Mock).mockReturnValue({ok:true,coverage:1,findings:[]});
    (createArtifactWithClaims as jest.Mock).mockResolvedValue({id:'quality-artifact',version:1});(recordArtifactReview as jest.Mock).mockResolvedValue({});
    const response=await POST(new Request('https://example.com',{method:'POST',body:JSON.stringify({opportunityId:'opp-1',resumeTaskId:'task',resumeTaskLease:'lease',resumeText:before+'\n'+skill,mode:'general_resume'})}));
    expect(response.status).toBe(200);expect((await response.json()).changes[0].after).toBe(improved);expect(callLLM).toHaveBeenCalledTimes(4);
    const trace=await(startResumeTrace as jest.Mock).mock.results[0].value;
    expect(trace.step).toHaveBeenCalledWith('review','polish_after_rejected_content_returned_to_editor',1);
  });
  test('content improvement is not discarded solely for an omittable terminal statistics note',async()=>{
    const before='负责店铺日常运营，主要做商品上架和链接整理。独立完成260条商品链接搭建与上架，整理为标题和详情页修改清单。协助店铺完成105件商品销售，未统计个人贡献比例。';
    const after='独立完成260条商品链接搭建与上架，整理为标题和详情页修改清单；协助店铺完成105件商品销售，未统计个人贡献比例。';
    (callLLM as jest.Mock).mockResolvedValueOnce(JSON.stringify({changes:[{before,after,reason:'删除重复职责，突出具体工作与交付，保留责任主体',sourceIds:['claim-1']}]})).mockResolvedValueOnce(JSON.stringify({status:'passed',summary:'保留协助店铺主体、交付对象与原有数字，删除重复职责',findings:[],document:passedDocument,valueChecks:[{index:0,useful:true,kind:'concision',impact:'content',reason:'删除重复职责，保留具体交付与团队归属'}]}));
    (reviewAtsText as jest.Mock).mockReturnValue({ok:true,coverage:1,findings:[]});(createArtifactWithClaims as jest.Mock).mockResolvedValue({id:'art'});(recordArtifactReview as jest.Mock).mockResolvedValue({});
    const response=await POST(new Request('https://example.com',{method:'POST',body:JSON.stringify({opportunityId:'opp-1',resumeText:before,mode:'general_resume'})}));
    expect(response.status).toBe(200);const change=(await response.json()).changes[0];expect(change.before).toBe(before);expect(change.after).toBe(after.replace('，未统计个人贡献比例。','。'));expect(callLLM).toHaveBeenCalledTimes(2);
    const reviewInput=(callLLM as jest.Mock).mock.calls[1][0].find((m:{content:string})=>m.content.includes('待审修改（findings'));
    const reviewed=JSON.parse(reviewInput.content.split('待审修改（findings 里的 changeId 必须从这里逐字取）：\n')[1]);expect(reviewed[0].after).toBe(change.after);expect(reviewed[0].before).toBe(before);
  });
  test('cosmetic labels never become a paid deliverable',async()=>{
    (resumeTaskInput as jest.Mock).mockResolvedValue({opportunity_id:'opp-1',answers:[]});
    (callLLM as jest.Mock).mockResolvedValue(JSON.stringify({changes:[{before:'Excel、Word',after:'办公软件：Excel、Word',sourceIds:['claim-1']}]}));
    const response=await POST(new Request('https://example.com',{method:'POST',body:JSON.stringify({opportunityId:'opp-1',resumeText:'Excel、Word',mode:'general_resume',resumeTaskId:'task',resumeTaskLease:'lease'})}));
    expect(response.status).toBe(422);expect(callLLM).toHaveBeenCalledTimes(3);expect(createArtifactWithClaims).not.toHaveBeenCalled();expect(finalizeQuota).toHaveBeenCalledWith(expect.anything(),false);
  });

  test('removing a missing-detail note cannot count as a useful edit of vague work',async()=>{
    const resumeText='- 参与校园二手平台项目，主要负责需求相关工作，具体个人交付还没梳理。';
    (resumeTaskInput as jest.Mock).mockResolvedValue({opportunity_id:'opp-1',answers:[]});
    (callLLM as jest.Mock).mockResolvedValue(JSON.stringify({changes:[{before:resumeText,after:'- 参与小组课程项目「校园二手平台」，主要负责需求相关工作。',sourceIds:['claim-1']}]}));
    const response=await POST(new Request('https://example.com',{method:'POST',body:JSON.stringify({opportunityId:'opp-1',resumeText,mode:'general_resume',resumeTaskId:'task',resumeTaskLease:'lease'})}));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({reasonCode:'resume_detail_needed',recovery:{field:'deliverable',sourceExcerpt:resumeText}});
    expect(finalizeQuota).toHaveBeenCalledWith(expect.anything(),false);
    expect(createArtifactWithClaims).not.toHaveBeenCalled();
  });

  test.each([['- 没有负责后端开发。','',200],['- 协助编写接口说明。','',422],['- 没有负责后端开发。','（删除该条）',200],['- 协助编写接口说明。','（删除该条）',422]])('only standalone disclaimer deletion can pass review: %s %s',async(before,after,status)=>{
    (callLLM as jest.Mock).mockResolvedValueOnce(JSON.stringify({changes:[{before,after,sourceIds:['claim-1'],reason:'独立免责声明不作为求职贡献'}]}))
      .mockResolvedValueOnce(JSON.stringify({document:passedDocument,status:'passed',valueChecks:usefulValueChecks,findings:[]}));
    (applyResumeChanges as jest.Mock).mockReturnValue({text:'其余完整简历',findings:[]});
    (reviewAtsText as jest.Mock).mockReturnValue({ok:true,coverage:0,findings:[]});
    (createArtifactWithClaims as jest.Mock).mockResolvedValue({id:'artifact-1'});
    (recordArtifactReview as jest.Mock).mockResolvedValue({});
    const response=await POST(new Request('https://example.com',{method:'POST',body:JSON.stringify({opportunityId:'opp-1',resumeText:before,mode:'general_resume'})}));
    expect(response.status).toBe(status);
    if(status===200)expect((await response.json()).changes[0]).toMatchObject({before,after:'',status:'pending'});
    else expect(createArtifactWithClaims).not.toHaveBeenCalled();
  });

  test('purely cosmetic attempts can end unchanged only after independent original review',async()=>{
    (resumeTaskInput as jest.Mock).mockResolvedValue({opportunity_id:'opp-1',answers:[]});
    (ownedResumeTaskSource as jest.Mock).mockResolvedValue({resume:'Excel、Word',jd:'',revision:'r',changes:[]});
    (finishResumeTask as jest.Mock).mockResolvedValue({state:'ready',result:{changes:[],unchanged:true}});
    const cosmetic=JSON.stringify({changes:[{before:'Excel、Word',after:'办公软件：Excel、Word',sourceIds:['claim-1']}]});
    (callLLM as jest.Mock).mockResolvedValueOnce(cosmetic).mockResolvedValueOnce(cosmetic).mockResolvedValueOnce(JSON.stringify({document:passedDocument,status:'passed',unchanged:true,summary:'现有技能清单清楚，增加标签没有信息价值。'}));
    const response=await POST(new Request('https://example.com',{method:'POST',body:JSON.stringify({opportunityId:'opp-1',resumeText:'Excel、Word',mode:'general_resume',resumeTaskId:'task',resumeTaskLease:'lease'})}));
    expect(response.status).toBe(200);expect(await response.json()).toMatchObject({unchanged:true,changes:[]});expect(callLLM).toHaveBeenCalledTimes(3);expect(finalizeQuota).toHaveBeenCalledWith(expect.anything(),false);
  });

  test('removing a disclaimer cannot hide a blocked contribution rewrite',async()=>{
    (callLLM as jest.Mock).mockResolvedValueOnce(JSON.stringify({changes:[
      {before:'协助编写接口说明。',after:'主导平台上线。',sourceIds:['claim-1']},
      {before:'没有负责后端开发。',after:'（删除该条）',sourceIds:['claim-1']},
    ]}));
    const response=await POST(new Request('https://example.com',{method:'POST',body:JSON.stringify({opportunityId:'opp-1',resumeText:'协助编写接口说明。\n没有负责后端开发。',mode:'general_resume'})}));
    expect(response.status).toBe(422);expect(createArtifactWithClaims).not.toHaveBeenCalled();
    expect(finalizeQuota).toHaveBeenCalledWith(expect.anything(),false);
  });

  test('cosmetic education edits cannot remove enrolled status instead of asking about vague experience',async()=>{
    const education='示例大学｜信息管理｜本科在读｜2023.09–2027.06';
    const vague='- 参与校园二手平台项目，主要负责需求相关工作，具体个人交付还没梳理。';
    const resumeText=`## 项目经历\n${vague}\n## 教育背景\n${education}`;
    (resumeTaskInput as jest.Mock).mockResolvedValue({opportunity_id:'opp-1',answers:[]});
    (ownedResumeTaskSource as jest.Mock).mockResolvedValue({resume:resumeText,jd:'',revision:'r',changes:[]});
    (callLLM as jest.Mock).mockResolvedValue(JSON.stringify({changes:[{before:education,after:'示例大学 信息管理 本科 2023.09–2027.06',sourceIds:['claim-1']}]}));
    const response=await POST(new Request('https://example.com',{method:'POST',body:JSON.stringify({opportunityId:'opp-1',resumeText,mode:'general_resume',resumeTaskId:'task',resumeTaskLease:'lease'})}));
    expect(response.status).toBe(422);expect(await response.json()).toMatchObject({reasonCode:'resume_detail_needed',recovery:{field:'deliverable',sourceExcerpt:vague}});
    expect(createArtifactWithClaims).not.toHaveBeenCalled();expect(finalizeQuota).toHaveBeenCalledWith(expect.anything(),false);
  });

  test('factually approved edits still require independent value approval',async()=>{
    (callLLM as jest.Mock).mockResolvedValueOnce(JSON.stringify({changes:[{before:'负责模型评测',after:'模型评测覆盖准确率口径',sourceIds:['claim-1']}]})).mockResolvedValueOnce(JSON.stringify({document:passedDocument,status:'passed',findings:[]}));
    const response=await POST(new Request('https://example.com',{method:'POST',body:JSON.stringify({opportunityId:'opp-1',resumeText:'负责模型评测',mode:'general_resume'})}));
    expect(response.status).toBe(503);expect((await response.json()).reasonCode).toBe('resume_review_unavailable');expect(createArtifactWithClaims).not.toHaveBeenCalled();expect(finalizeQuota).toHaveBeenCalledWith(expect.anything(),false);expect(callLLM).toHaveBeenCalledTimes(3);
  });

  test.each(['unchanged',undefined])('independently checked empty result (%s) keeps existing decisions and does not charge generation success',async status=>{
    const changes=[{id:'accepted',before:'旧句',after:'已采纳句',status:'accepted'}];
    (resumeTaskInput as jest.Mock).mockResolvedValue({opportunity_id:'opp-1',answers:[]});
    (ownedResumeTaskSource as jest.Mock).mockResolvedValue({resume:'负责模型评测',jd:'',revision:'r',changes});
    (finishResumeTask as jest.Mock).mockResolvedValue({state:'ready',result:{changes,unchanged:true}});
    (callLLM as jest.Mock).mockResolvedValueOnce(JSON.stringify({status,changes:[]})).mockResolvedValueOnce(JSON.stringify({document:passedDocument,status:'passed',unchanged:true,summary:'现有动作与交付已经清楚，无需重复改写。'}));
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
      .mockResolvedValueOnce(JSON.stringify({document:passedDocument,status:'passed',unchanged:true,summary:'现有动作与交付已经清楚，无需重复改写。'}));
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
      .mockResolvedValueOnce(JSON.stringify({document:passedDocument,status:'passed', valueChecks: usefulValueChecks,findings:[]}));
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
    (callLLM as jest.Mock).mockResolvedValueOnce(JSON.stringify({changes:[{before:'负责模型评测',after:'模型评测覆盖准确率口径',sourceIds:['claim-1']}]})).mockResolvedValueOnce(JSON.stringify({document:passedDocument,status:'passed', valueChecks: usefulValueChecks,findings:[]}));
    (applyResumeChanges as jest.Mock).mockReturnValue({text:'模型评测覆盖准确率口径',findings:[]});(reviewAtsText as jest.Mock).mockReturnValue({ok:true,coverage:1,findings:[]});(createArtifactWithClaims as jest.Mock).mockResolvedValue({id:'art',version:1});(recordArtifactReview as jest.Mock).mockResolvedValue({});
    const response=await POST(new Request('https://example.com/api/coach/resume-draft',{method:'POST',body:JSON.stringify({opportunityId:'opp-1',resumeText:'负责模型评测',mode:'general_resume',resumeTaskId:'task',resumeTaskLease:'lease'})}));
    expect(finishResumeTask).toHaveBeenCalled();
    expect(finalizeQuota).toHaveBeenCalledWith(expect.anything(),state==='ready');
    expect((finishResumeTask as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan((finalizeQuota as jest.Mock).mock.invocationCallOrder[0]);
    expect(response.status).toBe(state==='ready'?200:500);
  });

  test('normalizes only a unique PDF punctuation span back to actual original bytes',async()=>{
    const before='负责模型评测,记录准确率口径。';
    (callLLM as jest.Mock).mockResolvedValueOnce(JSON.stringify({changes:[{before:before.replace(',', '，'),after:'模型评测覆盖准确率口径',sourceIds:['claim-1']}]})).mockResolvedValueOnce(JSON.stringify({document:passedDocument,status:'passed', valueChecks: usefulValueChecks,findings:[]}));
    (applyResumeChanges as jest.Mock).mockReturnValue({text:'预览',findings:[]});(reviewAtsText as jest.Mock).mockReturnValue({ok:true,coverage:1,findings:[]});(createArtifactWithClaims as jest.Mock).mockResolvedValue({id:'art',version:1});(recordArtifactReview as jest.Mock).mockResolvedValue({});
    const response=await POST(new Request('https://example.com/api/coach/resume-draft',{method:'POST',body:JSON.stringify({opportunityId:'opp-1',resumeText:before,mode:'general_resume'})}));
    expect(response.status).toBe(200);expect((await response.json()).changes[0].before).toBe(before);
  });

  test('a skill-only change cannot masquerade as completion of saved experience supplements',async()=>{
    const before='参与校园项目,负责需求工作,个人交付未梳理。';
    (resumeTaskInput as jest.Mock).mockResolvedValueOnce({opportunity_id:'opp-1',answers:[{sourceExcerpt:before,answer:'我整理了需求清单。',claimId:'claim-1'}]});
    const skill=JSON.stringify({changes:[{before:'使用 Excel 整理资料',after:'- 使用 Excel\n- 整理资料',sourceIds:['claim-1']}]});
    (callLLM as jest.Mock).mockResolvedValueOnce(skill).mockResolvedValueOnce(skill)
      .mockResolvedValueOnce(JSON.stringify({status:'passed',summary:'把工具与动作拆成孤立标签，没有编辑价值',findings:[],document:passedDocument,valueChecks:[{index:0,useful:false,kind:'structure',reason:'仅把使用工具和整理资料拆开，反而破坏原动作关系'}]}));
    const response=await POST(new Request('https://example.com/api/coach/resume-draft',{method:'POST',body:JSON.stringify({opportunityId:'opp-1',resumeText:before+'\n使用 Excel 整理资料',mode:'general_resume',resumeTaskId:'task',resumeTaskLease:'lease'})}));
    expect(response.status).toBe(422);expect(callLLM).toHaveBeenCalledTimes(3);expect(createArtifactWithClaims).not.toHaveBeenCalled();expect(finalizeQuota).toHaveBeenCalledWith(expect.anything(),false);
    expect(await response.json()).toMatchObject({reasonCode:'resume_review_failed',retryable:true});
  });

  test('safe valuable edits elsewhere survive an unhandled supplement after one bounded repair',async()=>{
    const gap='参与校园工具项目，负责需求整理和讨论。';
    const resume=gap+'\n负责模型评测';
    (resumeTaskInput as jest.Mock).mockResolvedValue({opportunity_id:'opp-1',answers:[{id:'answer-1',sourceExcerpt:gap,answer:'我整理了需求清单。',claimId:'claim-1'}]});
    (ownedResumeTaskSource as jest.Mock).mockResolvedValue({resume,jd:'',revision:'r',changes:[]});
    (finishResumeTask as jest.Mock).mockResolvedValue({state:'ready'});
    const draft=JSON.stringify({changes:[{before:'负责模型评测',after:'模型评测覆盖准确率口径',sourceIds:['claim-1']}]});
    (callLLM as jest.Mock).mockResolvedValueOnce(draft).mockResolvedValueOnce(draft).mockResolvedValueOnce(JSON.stringify({document:passedDocument,status:'passed',valueChecks:usefulValueChecks,findings:[]}));
    (applyResumeChanges as jest.Mock).mockReturnValue({text:resume,findings:[]});(reviewAtsText as jest.Mock).mockReturnValue({ok:true,coverage:1,findings:[]});(createArtifactWithClaims as jest.Mock).mockResolvedValue({id:'art',version:1});(recordArtifactReview as jest.Mock).mockResolvedValue({});
    const response=await POST(new Request('https://example.com/api/coach/resume-draft',{method:'POST',body:JSON.stringify({opportunityId:'opp-1',resumeText:resume,mode:'general_resume',resumeTaskId:'task',resumeTaskLease:'lease'})}));
    const body=await response.json();expect(body).toMatchObject({ok:true});expect(response.status).toBe(200);expect(callLLM).toHaveBeenCalledTimes(3);
    expect(finishResumeTask).toHaveBeenCalledWith('user-1','task','lease',expect.anything(),expect.objectContaining({ok:true,summary:expect.stringContaining('刚才补充的那段暂未形成可靠改写')}));
    expect(finalizeQuota).toHaveBeenCalledWith(expect.anything(),true);
  });

  test('guided task repairs one rejected draft within the same quota reservation',async()=>{
    (resumeTaskInput as jest.Mock).mockResolvedValueOnce({opportunity_id:'opp-1',answers:[]});
    (callLLM as jest.Mock).mockResolvedValueOnce(JSON.stringify({changes:[{before:'负责模型评测',after:'主导模型评测全流程',sourceIds:['claim-1']}]}))
      .mockResolvedValueOnce(JSON.stringify({changes:[{before:'负责模型评测',after:'模型评测覆盖准确率口径',sourceIds:['claim-1']}]}))
      .mockResolvedValueOnce(JSON.stringify({document:passedDocument,status:'passed', valueChecks: usefulValueChecks,findings:[]}));
    (applyResumeChanges as jest.Mock).mockReturnValue({text:'模型评测覆盖准确率口径',findings:[]});(reviewAtsText as jest.Mock).mockReturnValue({ok:true,coverage:1,findings:[]});(createArtifactWithClaims as jest.Mock).mockResolvedValue({id:'art',version:1});(recordArtifactReview as jest.Mock).mockResolvedValue({});
    const response=await POST(new Request('https://example.com/api/coach/resume-draft',{method:'POST',body:JSON.stringify({opportunityId:'opp-1',resumeText:'负责模型评测',mode:'general_resume',resumeTaskId:'task',resumeTaskLease:'lease'})}));
    expect(response.status).toBe(200);expect(callLLM).toHaveBeenCalledTimes(3);expect(reserveQuota).toHaveBeenCalledTimes(1);expect(finalizeQuota).toHaveBeenCalledTimes(1);expect(finalizeQuota).toHaveBeenCalledWith(expect.anything(),true);
    expect(JSON.stringify((callLLM as jest.Mock).mock.calls[1][0])).toContain('上一版未通过校验');
    const reviewMessages=(callLLM as jest.Mock).mock.calls[2][0] as Array<{role:string;content:string}>;
    expect(reviewMessages.some(message=>message.role==='system'&&message.content.includes('"valueChecks"'))).toBe(true);
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
      return JSON.stringify({document:passedDocument,status:'passed',findings:[],valueChecks:candidates.map((_item:unknown,index:number)=>({index,useful:false,kind:'clarity',reason:'这处改写没有带来明确的编辑改善'}))});
    }).mockResolvedValue(JSON.stringify({status:'failed',changes:[]}));
    await POST(new Request('https://example.com',{method:'POST',body:JSON.stringify({opportunityId:'opp-1',resumeText:'课程项目：负责模型评测\n负责数据评测',mode:'general_resume',resumeTaskId:'task',resumeTaskLease:'lease'})}));
    expect(JSON.stringify((callLLM as jest.Mock).mock.calls[2][0])).toContain('不能去掉原文的虚构、示例或练习性质标记');
  });

  test('explicit format repair can split the same source paragraph into one applicable two-bullet edit',async()=>{
    (callLLM as jest.Mock).mockResolvedValueOnce(JSON.stringify({changes:[{before:'负责模型评测',after:'整理模型评测的准确率记录',sourceIds:['claim-1']},{before:'负责模型评测',after:'交付模型评测记录表',sourceIds:['claim-1']}]})).mockResolvedValueOnce(JSON.stringify({document:passedDocument,status:'passed', valueChecks: usefulValueChecks,findings:[]}));
    (applyResumeChanges as jest.Mock).mockReturnValue({text:'合并后预览',findings:[]});(reviewAtsText as jest.Mock).mockReturnValue({ok:true,coverage:1,findings:[]});
    (createArtifactWithClaims as jest.Mock).mockResolvedValue({id:'art',version:1});(recordArtifactReview as jest.Mock).mockResolvedValue({});
    const response=await runResumeDraft(new Request('https://example.com/api/coach/resume-draft',{method:'POST',body:JSON.stringify({opportunityId:'opp-1',resumeText:'负责模型评测',mode:'general_resume'})}),(await getCurrentUserFromRequest())!,{formatPolicy:'repair'});
    const body=await response.json();expect(body.changes).toHaveLength(1);expect(body.changes[0].after).toBe('- 整理模型评测的准确率记录\n- 交付模型评测记录表');
  });

  test('an ambiguous/conflicting preview is not delivered or billed as success',async()=>{
    (callLLM as jest.Mock).mockResolvedValueOnce(JSON.stringify({changes:[{before:'负责模型评测',after:'模型评测覆盖准确率口径',sourceIds:['claim-1']}]})).mockResolvedValueOnce(JSON.stringify({document:passedDocument,status:'passed', valueChecks: usefulValueChecks,findings:[]}));
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
      .mockResolvedValueOnce(JSON.stringify({document:passedDocument,status:'passed', valueChecks: usefulValueChecks,findings:[]}));
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
      .mockResolvedValueOnce(JSON.stringify({document:passedDocument,status:'passed', valueChecks: usefulValueChecks,findings:[]}));
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
      .mockResolvedValueOnce(JSON.stringify({document:passedDocument,status:"passed", valueChecks: usefulValueChecks,summary:"事实与短句通过",findings:[]}));
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
    expect((callLLM as jest.Mock).mock.calls[1][1]).toMatchObject({maxTokens:2200,reasoningBudgetTokens:8192,maxRetries:0,responseSchema:{name:'resume_independent_review_v1',schema:{required:['status','summary','findings','valueChecks','document','recovery']}}});
  });

  test("model exhaustion preserves source and refunds with an actionable message",async()=>{
    (callLLM as jest.Mock).mockRejectedValue(new Error("Empty response from LLM (finish_reason=length)"));
    const response=await POST(new Request("https://example.com/api/coach/resume-draft",{method:"POST",body:JSON.stringify({opportunityId:"opp-1",resumeText:"负责模型评测",mode:"general_resume"})}));
    expect(response.status).toBe(503);expect(await response.json()).toMatchObject({reasonCode:"resume_empty_response",retryable:true,error:expect.stringContaining("未扣额度")});
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
await expect(response.json()).resolves.toEqual(expect.objectContaining({ ok: false, reasonCode: "resume_draft_unverified", error: expect.stringContaining("没能生成可用的修改"), recovery: { sourceExcerpt: "AI Job Coach：负责模型评测", question: expect.stringContaining("你本人实际做的第一件事") } }));
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
        return JSON.stringify({document:passedDocument, status: "failed", valueChecks: usefulValueChecks, summary: "一条凭空加了口径", findings: [{ changeId: badId, severity: "error", message: "来源里没有幻觉率口径" }] });
      }).mockResolvedValueOnce(JSON.stringify({document:passedDocument}));
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
    expect(callLLM).toHaveBeenCalledTimes(3); // Final retained document, not rejected candidate, was checked.
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
        return JSON.stringify({document:passedDocument, status: "failed", valueChecks: usefulValueChecks, summary: "扩大职责", findings: [{ changeId: changes[0].id, severity: "warning", message: "增加了未提供的指标责任" }] });
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
    ] })).mockResolvedValueOnce(JSON.stringify({document:passedDocument, status: "passed", valueChecks: usefulValueChecks, summary: "保留项通过", findings: [] }));
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
  test.each(['pass','reject','global-block'])('a timed-out repair keeps only a freshly rechecked subset: %s',async finalReview=>{
    (resumeTaskInput as jest.Mock).mockResolvedValue({opportunity_id:'opp-1',answers:[]});
    const changes=[{before:'负责模型评测',after:'模型评测覆盖准确率口径',sourceIds:['claim-1']},{before:'负责数据评测',after:'数据评测覆盖准确率口径',sourceIds:['claim-1']}];
    (callLLM as jest.Mock).mockResolvedValueOnce(JSON.stringify({changes}))
      .mockImplementationOnce(async(messages)=>{
        const list=JSON.parse(messages.find((m:{content:string})=>m.content.includes('待审修改（findings')).content.split('：\n').at(-1));
        return JSON.stringify({status:'passed',summary:'逐条有价值，但第二处需返修',valueChecks:usefulValueChecks,findings:[],document:{status:'failed',summary:'第二处段落需要检查',findings:[{changeId:finalReview==='global-block'?null:list[1].id,category:'quality',severity:'error',message:'第二处段落结构需返修，第一处可用'}]}});
      }).mockRejectedValueOnce(new Error('LLM_REQUEST_TIMEOUT'))
      .mockResolvedValueOnce(JSON.stringify({document:finalReview==='reject'?{status:'failed',summary:'保留稿仍有整稿问题',findings:[{changeId:null,category:'quality',severity:'error',message:'保留稿仍不应交付'}]}:passedDocument}));
    (applyResumeChanges as jest.Mock).mockImplementation((_source,items)=>({text:items.map((c:{after:string})=>c.after).join('\n'),findings:[]}));
    (reviewAtsText as jest.Mock).mockReturnValue({ok:true,coverage:1,findings:[]});
    (createArtifactWithClaims as jest.Mock).mockResolvedValue({id:'art',version:1});(recordArtifactReview as jest.Mock).mockResolvedValue({});
    const response=await POST(new Request('https://example.invalid',{method:'POST',body:JSON.stringify({opportunityId:'opp-1',resumeTaskId:'task',resumeTaskLease:'lease',resumeText:'负责模型评测\n负责数据评测',mode:'general_resume'})}));
    const result=await response.json();
    if(finalReview==='pass'){
      expect(response.status).toBe(200);expect(result.partial).toBe(true);expect(result.reasonCode).toBe('resume_repair_timeout');
      expect(result.changes).toHaveLength(1);expect(result.changes[0].before).toBe('负责模型评测');
      expect(result.documentReview.status).toBe('passed');expect(result.summary).toContain('部分返修暂未完成');
      expect(finalizeQuota).toHaveBeenCalledWith(expect.anything(),true);
    }else{
      expect(response.status).toBe(finalReview==='global-block'?503:422);
      expect(createArtifactWithClaims).not.toHaveBeenCalled();expect(finalizeQuota).toHaveBeenCalledWith(expect.anything(),false);
    }
    expect(callLLM).toHaveBeenCalledTimes(finalReview==='global-block'?3:4);
    if(finalReview!=='global-block')expect(JSON.stringify((callLLM as jest.Mock).mock.calls[3][0])).toContain('只检查过滤后的最终保留稿');
  });

  test('whole-document failure returns diagnosis to original editor once; reviewer never writes',async()=>{
    const draft={changes:[{before:'负责模型评测',after:'模型评测覆盖准确率口径',sourceIds:['claim-1']},{before:'Excel、Word',after:'技能：Excel、Word',sourceIds:['claim-1']}]};
    const review={status:'passed',summary:'逐条可用',valueChecks:usefulValueChecks,findings:[],document:passedDocument};
    (callLLM as jest.Mock).mockResolvedValueOnce(JSON.stringify(draft))
      .mockImplementationOnce(async(messages)=>{
        const list=JSON.parse(messages.find((m:{content:string})=>m.content.includes('待审修改（findings')).content.split('待审修改（findings 里的 changeId 必须从这里逐字取）：\n')[1]);
        return JSON.stringify({...review,document:{status:'failed',summary:'整稿可读性还需修复',findings:[{changeId:list[0].id,category:'quality',severity:'error',message:'段内动作顺序不一致，退回原编辑检查'}]}});
      }).mockResolvedValueOnce(JSON.stringify({changes:draft.changes.slice(0,1)})).mockResolvedValueOnce(JSON.stringify(review));
    (reviewAtsText as jest.Mock).mockReturnValue({ok:true,coverage:1,findings:[]});
    (createArtifactWithClaims as jest.Mock).mockResolvedValue({id:'art'});(recordArtifactReview as jest.Mock).mockResolvedValue({});
    const response=await POST(new Request('https://example.invalid',{method:'POST',body:JSON.stringify({opportunityId:'opp-1',resumeText:'负责模型评测\nExcel、Word',mode:'general_resume'})}));
    expect(response.status).toBe(200);expect(callLLM).toHaveBeenCalledTimes(4);
    expect(JSON.stringify((callLLM as jest.Mock).mock.calls[2][0])).toContain('段内动作顺序不一致');
    expect(JSON.stringify((callLLM as jest.Mock).mock.calls[2][0])).toContain('仅改标签');
    expect(JSON.stringify((callLLM as jest.Mock).mock.calls[2][0])).toContain('Excel、Word');
    expect(JSON.stringify((callLLM as jest.Mock).mock.calls[1][0])).toContain('appliedCandidate');
    expect((await response.json()).workflow.maxRepairs).toBe(1);
  });
  test('missing whole-document verdict twice blocks, never becomes success because some changes survive',async()=>{
    (callLLM as jest.Mock).mockResolvedValueOnce(JSON.stringify({changes:[{before:'负责模型评测',after:'模型评测覆盖准确率口径',sourceIds:['claim-1']}]}))
      .mockResolvedValue(JSON.stringify({status:'passed',valueChecks:usefulValueChecks,findings:[]}));
    const response=await POST(new Request('https://example.invalid',{method:'POST',body:JSON.stringify({opportunityId:'opp-1',resumeText:'负责模型评测',mode:'general_resume'})}));
    expect(response.status).toBe(503);expect((await response.json()).reasonCode).toBe('resume_review_unavailable');
    expect(callLLM).toHaveBeenCalledTimes(3);expect(createArtifactWithClaims).not.toHaveBeenCalled();
    const operations=(runWithGenerationContext as jest.Mock).mock.calls.map(([c])=>c.operation);
    expect(operations.filter(x=>x==='resume_draft')).toHaveLength(1);expect(operations.filter(x=>x==='resume_review')).toHaveLength(2);
  });
  test.each([undefined,'failed'])('unattributed review status %s repairs only reviewer, retaining grounded draft and one reservation',async status=>{
    const review={status:'passed',summary:'真实动作与交付清晰',document:passedDocument,valueChecks:usefulValueChecks,findings:[]};
    (callLLM as jest.Mock).mockResolvedValueOnce(JSON.stringify({changes:[{before:'负责模型评测',after:'模型评测覆盖准确率口径',sourceIds:['claim-1']}]}))
      .mockResolvedValueOnce(JSON.stringify({...review,status})).mockResolvedValueOnce(JSON.stringify(review));
    (reviewAtsText as jest.Mock).mockReturnValue({ok:true,coverage:1,findings:[]});
    (createArtifactWithClaims as jest.Mock).mockResolvedValue({id:'art'});(recordArtifactReview as jest.Mock).mockResolvedValue({});
    const response=await POST(new Request('https://example.invalid',{method:'POST',body:JSON.stringify({opportunityId:'opp-1',resumeText:'负责模型评测',mode:'general_resume'})}));
    expect(response.status).toBe(200);expect(callLLM).toHaveBeenCalledTimes(3);expect(reserveQuota).toHaveBeenCalledTimes(1);
    expect(finalizeQuota).toHaveBeenCalledWith(expect.anything(),true);
    const calls=(callLLM as jest.Mock).mock.calls;
    expect(calls[2][0].find((m:{content:string})=>m.content.includes('待审修改（'))).toEqual(calls[1][0].find((m:{content:string})=>m.content.includes('待审修改（')));
    expect(JSON.stringify(calls[2][0])).toContain('候选正文没有变化');
    const operations=(runWithGenerationContext as jest.Mock).mock.calls.map(([c])=>c.operation);
    expect(operations).toEqual(['resume_draft','resume_review','resume_review']);
  });
  test('whole-document candidate includes earlier accepted decisions and equals the saved preview',async()=>{
    const resumeText='负责模型评测\n维护评测记录';
    const existing={id:'accepted-before-this-run',section:'记录',before:'维护评测记录',after:'每周维护评测记录，供同事核对',evidenceId:null,status:'accepted'};
    (resumeTaskInput as jest.Mock).mockResolvedValue({opportunity_id:'opp-1',answers:[]});
    (ownedResumeTaskSource as jest.Mock).mockResolvedValue({resume:resumeText,jd:'',revision:'r',changes:[existing]});
    (finishResumeTask as jest.Mock).mockResolvedValue({state:'ready'});
    (applyResumeChanges as jest.Mock).mockImplementation(jest.requireActual('@/lib/coach-harness/application-quality').applyResumeChanges);
    (callLLM as jest.Mock).mockResolvedValueOnce(JSON.stringify({changes:[{before:'负责模型评测',after:'模型评测覆盖准确率口径',sourceIds:['claim-1']}]}))
      .mockResolvedValueOnce(JSON.stringify({document:passedDocument,status:'passed',summary:'整体检查',valueChecks:usefulValueChecks,findings:[]}));
    (reviewAtsText as jest.Mock).mockReturnValue({ok:true,coverage:1,findings:[]});
    (createArtifactWithClaims as jest.Mock).mockResolvedValue({id:'art'});(recordArtifactReview as jest.Mock).mockResolvedValue({});
    const response=await POST(new Request('https://eval.invalid',{method:'POST',body:JSON.stringify({opportunityId:'opp-1',resumeText,mode:'general_resume',resumeTaskId:'task',resumeTaskLease:'lease'})}));
    expect(response.status).toBe(200);
    const input=(callLLM as jest.Mock).mock.calls[1][0].find((m:{content:string})=>m.content.startsWith('{"appliedCandidate"'));
    const candidate=JSON.parse(input.content).appliedCandidate;
    expect(candidate).toContain(existing.after);
    expect((createArtifactWithClaims as jest.Mock).mock.calls[0][0].content.previewText).toBe(candidate);
    expect((await response.json()).changes).toContainEqual(existing);
  });
  test('an optional question cannot block confirming an already clear unchanged source',async()=>{
    const resumeText='每周核对销售表，将缺失项标记在Excel清单，交给店长补齐。';
    (resumeTaskInput as jest.Mock).mockResolvedValue({opportunity_id:'opp-1',answers:[]});
    const empty={changes:[],recovery:{sourceExcerpt:resumeText,field:'outcome',question:'店长补齐后，你是否会再次核对清单？'}};
    (callLLM as jest.Mock).mockResolvedValueOnce(JSON.stringify(empty)).mockResolvedValueOnce(JSON.stringify(empty))
      .mockResolvedValueOnce(JSON.stringify({status:'passed',unchanged:true,summary:'现有动作、对象、交付与用途清楚，后续复核并非必要事实。'}));
    const response=await POST(new Request('https://eval.invalid',{method:'POST',body:JSON.stringify({opportunityId:'opp-1',resumeText,mode:'general_resume',resumeTaskId:'task',resumeTaskLease:'lease'})}));
    expect(response.status).toBe(200);expect(await response.json()).toMatchObject({unchanged:true,changes:[]});
    expect(callLLM).toHaveBeenCalledTimes(3);expect(finalizeQuota).toHaveBeenCalledWith(expect.anything(),false);
  });
  test('isolated execution refuses old data targets before read, quota or model',async()=>{
    const response=await runResumeDraft(new Request('https://eval.invalid',{method:'POST',body:JSON.stringify({opportunityId:'old',resumeText:'负责模型评测',mode:'general_resume'})}),{id:'admin'} as any,{isolated:true});
    expect(response.status).toBe(500);expect(startResumeTrace).not.toHaveBeenCalled();expect(reserveQuota).not.toHaveBeenCalled();expect(callLLM).not.toHaveBeenCalled();
  });
  test('self-review and format-only are real alternative execution paths, not renamed independent calls',async()=>{
    for(const strategy of ['self_review','format_only'] as const){
      (callLLM as jest.Mock).mockReset();
      (callLLM as jest.Mock).mockResolvedValue(JSON.stringify({changes:[{before:'负责模型评测',after:'模型评测覆盖准确率口径',sourceIds:['claim-1']}],selfReview:{status:'passed',summary:'原编辑自查',valueChecks:usefulValueChecks,findings:[],document:passedDocument}}));
      (reviewAtsText as jest.Mock).mockReturnValue({ok:true,coverage:1,findings:[]});
      (createArtifactWithClaims as jest.Mock).mockResolvedValue({id:'art'});(recordArtifactReview as jest.Mock).mockResolvedValue({});
      const response=await runResumeDraft(new Request('https://eval.invalid',{method:'POST',body:JSON.stringify({opportunityId:'opp-1',resumeText:'负责模型评测',mode:'general_resume'})}),{id:'admin'} as any,{strategy});
      expect(response.status).toBe(200);expect(callLLM).toHaveBeenCalledTimes(1);
      expect((await response.json()).reviewer.passed).toBe(false);
    }
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
