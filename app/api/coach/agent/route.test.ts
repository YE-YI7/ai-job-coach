import {GET,POST} from "./route";
import {getCurrentUserFromRequest} from "@/lib/auth";
import {getDbClient} from "@/lib/db";
import {callLLM} from "@/lib/llm";
import {resolveChatModel} from "@/lib/coach-harness/chat-models";
import {getContextBundleForUser,recordTierIntentFromText} from "@/lib/coach-harness/repository";
import {readLearningMemory,refreshProfileMemory,readLearningSession,LEARNING_PROMPT_VERSION} from "@/lib/coach-harness/learning-memory";
import {decide,registerGuard} from "@/lib/coach-harness/guard-slots";
jest.mock("@/lib/coach-harness/learning-memory",()=>({...jest.requireActual("@/lib/coach-harness/learning-memory"),readLearningMemory:jest.fn(),refreshProfileMemory:jest.fn(),readLearningSession:jest.fn()}));
jest.mock("@/lib/auth");
jest.mock("@/lib/db");
jest.mock("@/lib/llm");
jest.mock("@/lib/metered-ai-route",()=>({withMeteredAiRoute:(handler:unknown)=>handler}));
jest.mock("@/lib/coach-harness/repository");
jest.mock("@/lib/coach-harness/chat-models");
jest.mock("@/lib/coach-harness",()=>({assertContextFits:jest.fn(),renderContextForPrompt:()=>({text:"context"})}));
function setupGeneration(saveError=false){
 (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({id:"owner"});
 const q={select:jest.fn().mockReturnThis(),eq:jest.fn().mockReturnThis(),is:jest.fn().mockReturnThis(),order:jest.fn().mockReturnThis(),insert:jest.fn().mockReturnThis(),limit:jest.fn().mockResolvedValue({data:[]}),maybeSingle:jest.fn().mockResolvedValue({data:null}),single:jest.fn().mockResolvedValue(saveError?{error:{message:"db down"}}:{data:{id:"saved"}})};
 (getDbClient as jest.Mock).mockResolvedValue({from:()=>q});
 (getContextBundleForUser as jest.Mock).mockResolvedValue({knowledge:[],attachments:[],usage:{truncated:false},selection:{included:[],excluded:[]}});
 (resolveChatModel as jest.Mock).mockResolvedValue({model:"glm-5.3"});
 return q;
}
function streamRequest(mode="auto") {return new Request("https://example.com/api/coach/agent",{method:"POST",headers:{accept:"application/x-ndjson"},body:JSON.stringify({modelMode:mode,message:"教我一个概念",requestId:"11111111-1111-4111-8111-111111111111"})});}
describe("agent boundary",()=>{
 beforeEach(()=>jest.resetAllMocks());
 test("明确结束时模型澄清不流出，保存的也是最终收尾而非假完成",async()=>{
  const q=setupGeneration();
  (callLLM as jest.Mock).mockImplementation(async(_m,o)=>{o.onDelta("<clarify level=\"blocking\">你已经完全掌握，继续做题？</clarify>");return '<clarify level="blocking">懂了是什么意思？</clarify>';});
  const response=await POST(new Request("https://example.com/api/coach/agent",{method:"POST",headers:{accept:"application/x-ndjson"},body:JSON.stringify({message:"先这样，够了",requestId:"11111111-1111-4111-8111-111111111111"})}));
  const wire=await response.text();
  expect(wire).not.toMatch(/完全掌握|懂了是什么意思|继续做题/);
  const done=wire.trim().split("\n").map(x=>JSON.parse(x)).at(-1);
  expect(done).toMatchObject({ok:true,answer:expect.stringContaining("先到这里")});
  expect(q.insert).toHaveBeenCalledWith(expect.objectContaining({answer:done.answer}));
 });
 test("准入失败不泄露内部事实 ID 清单，也不调用模型",async()=>{
  setupGeneration();
  const unregister=registerGuard(1,{id:"test.capacity-leak",run:()=>decide(1,"test.capacity-leak","block","context_budget_exceeded","关键内容装不进 4000 token 预算：confirmed_fact [private-id] 需要 83 token。",{status:422})});
  try {
   const response=await POST(new Request("https://example.com/api/coach/agent",{method:"POST",body:JSON.stringify({message:"教我一个概念",requestId:"11111111-1111-4111-8111-111111111111"})}));
   expect(response.status).toBe(422);
   const body=await response.json();
   expect(body.error).toContain("你的档案仍然保留");
   expect(JSON.stringify(body)).not.toMatch(/private-id|confirmed_fact|token/);
   expect(callLLM).not.toHaveBeenCalled();
  } finally {unregister();}
 });
 test("普通教学选相关事实，代写简历仍要求完整事实审核",async()=>{
  setupGeneration();(callLLM as jest.Mock).mockResolvedValue("先从任务拆分开始。");
  await (await POST(streamRequest())).text();
  expect(getContextBundleForUser).toHaveBeenCalledWith(expect.objectContaining({claimSelection:"relevant"}));
  (getContextBundleForUser as jest.Mock).mockClear();
  await POST(new Request("https://example.com/api/coach/agent",{method:"POST",body:JSON.stringify({message:"帮我写一条简历项目描述",requestId:"22222222-2222-4222-8222-222222222222"})}));
  expect(getContextBundleForUser).toHaveBeenCalledWith(expect.objectContaining({claimSelection:"all_required"}));
 });
 test("checked text arrives while the model is still generating, final replaces not appends",async()=>{
  const q=setupGeneration();let finishModel!:(text:string)=>void;
  (callLLM as jest.Mock).mockImplementation(async(_m,o)=>{o.onDelta("<answer>第一句。");return new Promise(resolve=>{finishModel=resolve;});});
  const reader=(await POST(streamRequest())).body!.getReader();let wire="";
  while(!wire.includes('"type":"replace"')){const next=await reader.read();wire+=new TextDecoder().decode(next.value);}
  expect(wire).toContain("第一句。");expect(q.insert).not.toHaveBeenCalled();
  finishModel("<answer>第一句。第二句。</answer>");
  while(true){const next=await reader.read();if(next.done)break;wire+=new TextDecoder().decode(next.value);}
  const events=wire.trim().split("\n").map(x=>JSON.parse(x));
  expect(events.at(-1)).toMatchObject({ok:true,answer:"第一句。第二句。"});
  expect(events.filter(e=>e.type==="delta")).toHaveLength(0);expect(q.insert).toHaveBeenCalledTimes(1);
 });
 test("对话里说出的公司层次意向被接住，接不住也不影响本轮回答",async()=>{
  setupGeneration();
  (callLLM as jest.Mock).mockResolvedValue("好，按创业公司这个方向来挑。");
  const ask=()=>POST(new Request("https://example.com/api/coach/agent",{method:"POST",body:JSON.stringify({message:"我主要想看创业公司的岗位",requestId:"11111111-1111-4111-8111-111111111111"})}));
  expect((await (await ask()).json()).ok).toBe(true);
  expect(recordTierIntentFromText).toHaveBeenCalledWith(expect.objectContaining({userId:"owner",text:"我主要想看创业公司的岗位"}));
  (recordTierIntentFromText as jest.Mock).mockRejectedValue(Error("db down"));
  expect((await (await ask()).json()).ok).toBe(true);
 });
 test("repeated model paragraphs fail visibly without persistence or automatic retry",async()=>{
  const q=setupGeneration();
  (callLLM as jest.Mock).mockImplementation(async(_m,o)=>{o.onDelta("<answer>"+"模型重复开头而不推进内容，这段超过四十个字的文字连续出现三遍，应该立即中止而不是继续显示。".repeat(3));return "不应保存";});
  const events=(await (await POST(streamRequest())).text()).trim().split("\n").map(x=>JSON.parse(x));
  expect(events.at(-1)).toMatchObject({ok:false,error:expect.stringContaining("输出重复")});
  expect(q.insert).not.toHaveBeenCalled();expect(callLLM).toHaveBeenCalledTimes(1);
 });
 test("a named saved job supplies context without moving the original conversation",async()=>{
  const q=setupGeneration();
  const jobId="33333333-3333-4333-8333-333333333333";
  const jobs={select:jest.fn().mockReturnThis(),eq:jest.fn().mockReturnThis(),order:jest.fn().mockReturnThis(),limit:jest.fn().mockResolvedValue({data:[{id:jobId,company:"Kimi",role:"Agent 协作产品经理"}]})};
  (getDbClient as jest.Mock).mockResolvedValue({from:(table:string)=>table==="coach_opportunities"?jobs:q});
  (callLLM as jest.Mock).mockResolvedValue("我们先拆这份已保存JD。");
  const response=await POST(new Request("https://example.com/api/coach/agent",{method:"POST",body:JSON.stringify({message:"那拆 Kimi 的 Agent 协作产品经理吧",requestId:"11111111-1111-4111-8111-111111111111"})}));
  expect((await response.json()).ok).toBe(true);
  expect(getContextBundleForUser).toHaveBeenCalledWith(expect.objectContaining({userId:"owner",opportunityId:jobId}));
  expect(q.insert).toHaveBeenCalledWith(expect.objectContaining({opportunity_id:null}));
  expect(jobs.eq).toHaveBeenCalledWith("user_id","owner");
  const prompt=(callLLM as jest.Mock).mock.calls[0][0][1].content;
  expect(prompt).toContain("本轮用户指名的已保存岗位：Kimi");
  // 权威材料排在派生摘要之前；空的可选料不再占一段。
  expect(prompt.indexOf("本轮用户指名的已保存岗位")).toBeLessThan(prompt.indexOf("已装配的岗位与事实材料"));
  expect(prompt).not.toContain("个人背景摘要");
 });
 test("referencing an owned job cannot bypass the original workspace ownership",async()=>{
  const q=setupGeneration();
  const jobs={select:jest.fn().mockReturnThis(),eq:jest.fn().mockReturnThis(),order:jest.fn().mockReturnThis(),limit:jest.fn().mockResolvedValue({data:[{id:"33333333-3333-4333-8333-333333333333",company:"Kimi",role:"Agent 协作产品经理"}]}),maybeSingle:jest.fn().mockResolvedValue({data:null})};
  (getDbClient as jest.Mock).mockResolvedValue({from:(table:string)=>table==="coach_opportunities"?jobs:q});
  const response=await POST(new Request("https://example.com/api/coach/agent",{method:"POST",body:JSON.stringify({opportunityId:"44444444-4444-4444-8444-444444444444",message:"拆Kimi岗位",requestId:"11111111-1111-4111-8111-111111111111"})}));
  expect(response.status).toBe(404);
  expect(callLLM).not.toHaveBeenCalled();
  expect(q.insert).not.toHaveBeenCalled();
 });
 test("resume drafts are checked before any draft text is streamed",async()=>{
  setupGeneration();(callLLM as jest.Mock).mockResolvedValueOnce(JSON.stringify({resumeQuotes:[],nextStep:"请补充真实项目动作"}));
  const req=new Request("https://example.com/api/coach/agent",{method:"POST",headers:{accept:"application/x-ndjson"},body:JSON.stringify({message:"帮我写一条简历项目描述",requestId:"11111111-1111-4111-8111-111111111111"})});
  const events=(await (await POST(req)).text()).trim().split("\n").map(x=>JSON.parse(x));
  expect(callLLM).toHaveBeenCalledTimes(1);
  expect((callLLM as jest.Mock).mock.calls[0][1].onDelta).toBeUndefined();
  expect(events.at(-1)).toMatchObject({ok:true,learning_trace:{groundedDraft:true,modelCalls:1}});
  expect(events.at(-1).answer).not.toContain("未经核实");
 });
 test("auto 档冷却换档：from→to 记进台账，事后能还原这一轮换过模型",async()=>{
  setupGeneration();
  (callLLM as jest.Mock)
   .mockRejectedValueOnce(new Error("upstream 502 Bad Gateway"))
   .mockResolvedValueOnce("<answer>换档之后继续讲这个概念。</answer>");
  const response=await POST(new Request("https://example.com/api/coach/agent",{method:"POST",body:JSON.stringify({modelMode:"auto",message:"教我一个概念",requestId:"11111111-1111-4111-8111-111111111111"})}));
  expect(callLLM).toHaveBeenCalledTimes(2);
  expect((callLLM as jest.Mock).mock.calls[1][1].model).toBe("deepseek-v4-flash");
  // selection.model 会被改写成应答模型，没有 modelSwap 的话台账里首选=应答，换档无痕。
  expect((await response.json()).learning_trace).toMatchObject({model:"deepseek-v4-flash",modelCalls:2,modelSwap:{from:"glm-5.3",to:"deepseek-v4-flash"}});
 });
 test("没有换档就不下发 modelSwap，界面不会凭空提示",async()=>{
  setupGeneration();
  (callLLM as jest.Mock).mockResolvedValue("<answer>一次就答完了，没有换档。</answer>");
  const response=await POST(new Request("https://example.com/api/coach/agent",{method:"POST",body:JSON.stringify({modelMode:"auto",message:"教我一个概念",requestId:"11111111-1111-4111-8111-111111111111"})}));
  expect((await response.json()).learning_trace.modelSwap).toBeUndefined();
 });
 test("optional memory failure does not block a scoped, persisted reply",async()=>{
  setupGeneration();(readLearningSession as jest.Mock).mockResolvedValue({opportunity_id:null,status:"active"});
  (readLearningMemory as jest.Mock).mockRejectedValue(Error("cache down"));(refreshProfileMemory as jest.Mock).mockRejectedValue(Error("cache down"));(callLLM as jest.Mock).mockResolvedValue("正常回答");
  const r=await POST(new Request("https://example.com/api/coach/agent",{method:"POST",body:JSON.stringify({sessionId:"22222222-2222-4222-8222-222222222222",message:"问题",requestId:"11111111-1111-4111-8111-111111111111"})}));
  expect((await r.json()).ok).toBe(true);expect(readLearningSession).toHaveBeenCalled();
 });
 test("streams deltas, then persisted answer and structured suggestions",async()=>{
  const q=setupGeneration();
  (callLLM as jest.Mock).mockImplementation(async(_m,o)=>{o.onDelta("开始解释");expect(q.insert).not.toHaveBeenCalled();return '开始解释<followups>["请继续"]</followups>';});
  const events=(await (await POST(streamRequest())).text()).trim().split("\n").map(x=>JSON.parse(x));
  expect(events.filter(e=>e.type==="delta")).toEqual([{type:"delta",text:"开始解释"}]);
  expect(events.some(e=>e.type==="status"&&e.message.includes("已生成"))).toBe(true);
  expect(events.at(-1)).toMatchObject({ok:true,id:"saved",answer:"开始解释",learning_trace:{suggestions:["请继续"]}});
  expect(q.insert).toHaveBeenCalledTimes(1);
 });
 test("blocking raw chunks never escape and only guarded text is emitted",async()=>{
  setupGeneration();
  const raw='<clarify level="blocking">你想申请什么岗位？</clarify>'+"你已经掌握所有技能。".repeat(30);
  (callLLM as jest.Mock).mockImplementation(async(_m,o)=>{for(const part of [raw.slice(0,5),raw.slice(5,33),raw.slice(33)])o.onDelta(part);return raw;});
  const events=(await (await POST(streamRequest())).text()).trim().split("\n").map(x=>JSON.parse(x));
  expect(events.filter(e=>e.type==="delta")).toEqual([{type:"delta",text:"你想申请什么岗位？"}]);
  expect(events.at(-1)).toMatchObject({blocked:true,needsMoreInput:true});
  expect(events.at(-1).learning_trace.timing.firstTextMs).toBeGreaterThanOrEqual(events.at(-1).learning_trace.timing.modelFirstTextMs);
 });
 test("JD 与简历原文已在上下文里时，索要它们的 blocking 轮不拦（GS-004 误挡）",async()=>{
  setupGeneration();
  (getContextBundleForUser as jest.Mock).mockResolvedValue({
    knowledge:[],
    opportunity:{id:"22222222-2222-4222-8222-222222222222",jdText:"岗位：AI 产品经理。要求：3 年以上经验。",jdVersion:1},
    attachments:[{id:"resume-text",label:"用户已上传的简历原文",text:"实习：某 SaaS 公司产品经理实习生。",required:false}],
    usage:{truncated:false},
    selection:{included:[{kind:"opportunity",refId:"22222222-2222-4222-8222-222222222222"},{kind:"attachment",refId:"resume-text"}],excluded:[]},
  });
  const body="先拆这份岗位的三条硬性门槛，再对照你简历里的实习逐条找证据。".repeat(5);
  (callLLM as jest.Mock).mockResolvedValue(`<clarify level="blocking">方便把 JD 原文发我一下吗？</clarify>${body}`);
  const events=(await (await POST(streamRequest())).text()).trim().split("\n").map(x=>JSON.parse(x));
  expect(events.at(-1)).toMatchObject({ok:true,blocked:false,needsMoreInput:false,answer:body});
  expect(events.at(-1).learning_trace.insufficiency).toMatchObject({level:"blocking",downgradedRedundantAsk:"document_handover",providedMaterials:["jd","resume"]});
 });
 // FR-21：材料被预算舍弃过，就不能当成「已经给过」——此时索要它是正当的。
 test("简历虽在库里但本轮没进提示词时，索要简历不被当成重复追问",async()=>{
  setupGeneration();
  (getContextBundleForUser as jest.Mock).mockResolvedValue({
    knowledge:[],
    opportunity:{id:"22222222-2222-4222-8222-222222222222",jdText:"岗位：AI 产品经理。",jdVersion:1},
    attachments:[{id:"resume-text",label:"用户已上传的简历原文",text:"实习：某 SaaS 公司产品经理实习生。",required:false}],
    usage:{truncated:false},
    selection:{included:[{kind:"opportunity",refId:"22222222-2222-4222-8222-222222222222"}],excluded:[{kind:"attachment",refId:"resume-text",reason:"budget_exhausted"}]},
  });
  (callLLM as jest.Mock).mockResolvedValue('<clarify level="blocking">把你现在的简历原文发我，我按岗位逐条对照。</clarify>');
  const events=(await (await POST(streamRequest())).text()).trim().split("\n").map(x=>JSON.parse(x));
  expect(events.at(-1).learning_trace.insufficiency.providedMaterials).toEqual(["jd"]);
  expect(events.at(-1)).toMatchObject({blocked:true,needsMoreInput:true});
 });
 // FR-33/21：台账必须能还原「这一轮模型真看见了什么」。
 test("砍过的料在提示词里自带完整性声明，并逐条落台账",async()=>{
  const q=setupGeneration();
  (callLLM as jest.Mock).mockResolvedValue("回答");
  const oversized=new Request("https://example.com/api/coach/agent",{method:"POST",body:JSON.stringify({message:"带我练一轮",pageContext:"我在简历台改第三段。".repeat(2000),requestId:"11111111-1111-4111-8111-111111111111"})});
  const events=await (await POST(oversized)).json();
  const prompt=(callLLM as jest.Mock).mock.calls[0][0][1].content;
  expect(prompt).toContain("【当前界面与最近操作·派生·不可当事实】");
  expect(prompt).toContain("仅见部分内容");
  expect(events.learning_trace.materials).toMatchObject({version:"materials-v3",budgetTokens:8000});
  expect(events.learning_trace.materials.partialNotices).toEqual(["当前界面与最近操作仅见部分内容"]);
  const injected=events.learning_trace.materials.injected as Array<{kind:string;truncated:boolean;required:boolean}>;
  expect(injected.find((i)=>i.kind==="page_activity")).toMatchObject({truncated:true,required:false});
  expect(injected.find((i)=>i.kind==="compiled_context")).toMatchObject({required:true,truncated:false});
  expect(q.insert).toHaveBeenCalledWith(expect.objectContaining({learning_trace:expect.objectContaining({materials:events.learning_trace.materials})}));
 });
 // FR-21 保护区：装配不下时不降级、不带残缺材料作答。
 test("保护区装不下就拒绝生成：不调模型、不落库、说清是哪条料",async()=>{
  const q=setupGeneration();
  // 事实底稿是保护区：一条都不能悄悄丢，丢不起就整轮失败，而不是拿半份材料代写。
  (getContextBundleForUser as jest.Mock).mockResolvedValue({
    knowledge:[],attachments:[],
    claims:Array.from({length:400},(_,i)=>({id:`claim-${i}`,displayText:`我在某公司负责第${i}条经历，动作与结果都写清楚了。`,status:"confirmed"})),
    usage:{truncated:false},
    selection:{included:[],excluded:[]},
  });
  const response=await POST(new Request("https://example.com/api/coach/agent",{method:"POST",body:JSON.stringify({message:"帮我写一条简历项目描述",requestId:"11111111-1111-4111-8111-111111111111"})}));
  expect(response.status).toBe(400);
  expect((await response.json()).error).toContain("可用于简历事实的来源");
  expect(callLLM).not.toHaveBeenCalled();
  expect(q.insert).not.toHaveBeenCalled();
 });
 // W1 §5.3：主链路只认槽、不认具体守卫——挂载点必须能拦下真实请求，不改 route 一行。
 test("往槽1再挂一条守卫，不改主链路就能拦下这一轮：不调模型、不落库",async()=>{
  const q=setupGeneration();
  const unregister=registerGuard(1,{id:"test.slot1-extra",run:()=>decide(1,"test.slot1-extra","block","test_block","测试守卫：这一轮不许出请求。",{status:400})});
  try {
   const response=await POST(new Request("https://example.com/api/coach/agent",{method:"POST",body:JSON.stringify({message:"带我练一轮",requestId:"11111111-1111-4111-8111-111111111111"})}));
   expect(response.status).toBe(400);
   expect((await response.json()).error).toBe("测试守卫：这一轮不许出请求。");
   expect(callLLM).not.toHaveBeenCalled();
   expect(q.insert).not.toHaveBeenCalled();
  } finally { unregister(); }
 });
 // FR-20/21：每一次介入都要能在台账里还原成「哪一槽、哪条守卫、什么裁决」。
 test("台账逐条记下本轮跑过哪几槽、哪条守卫给了什么裁决",async()=>{
  setupGeneration();
  (callLLM as jest.Mock).mockResolvedValue("回答");
  const events=await (await POST(new Request("https://example.com/api/coach/agent",{method:"POST",body:JSON.stringify({message:"教我一个概念",requestId:"11111111-1111-4111-8111-111111111111"})}))).json();
  const guards=events.learning_trace.guards as Array<{slot:number;guardId:string;outcome:string;code:string}>;
  expect(guards).toEqual(expect.arrayContaining([
   {slot:1,guardId:"admission.capacity",outcome:"pass",code:"context_fits"},
   {slot:1,guardId:"admission.material-gap",outcome:"pass",code:"input_absent"},
   {slot:1,guardId:"admission.resume-grounding",outcome:"pass",code:"general_consult"},
   {slot:1,guardId:"admission.prompt-capacity",outcome:"pass",code:"protected_materials_fit"},
   {slot:3,guardId:"verify.insufficiency",outcome:"pass",code:"no_gap_signal"},
  ]));
  // 槽4 是落库后事件：只出建议，不写回本轮台账（阶段推进由用户点头，走响应）。
  expect(guards.some((g)=>g.slot===4)).toBe(false);
 });
 // FR-34：每一轮台账必须挂得上「哪个版本」，且能拆成五个组件比对。
 test("台账落版本联合指纹：五个组件加合号，响应不暴露私有提示词正文",async()=>{
  const q=setupGeneration();(callLLM as jest.Mock).mockResolvedValue("回答");
  const events=(await (await POST(streamRequest())).text()).trim().split("\n").map(x=>JSON.parse(x));
  const harness=events.at(-1).learning_trace.harness;
  expect(Object.keys(harness).sort()).toEqual(["combined","guard","knowledge","modelRoute","prompt","retrieval"]);
  expect(Object.values(harness).every((v)=>/^[0-9a-f]{12}$/.test(String(v)))).toBe(true);
  expect(events.at(-1).learning_trace.promptVersion).toBe(LEARNING_PROMPT_VERSION);
  expect(events.at(-1).learning_trace.compiledPrompt).toBeUndefined();
  expect(q.insert).toHaveBeenCalledWith(expect.objectContaining({learning_trace:expect.objectContaining({harness})}));
 });
 test("storage failure never emits successful completion",async()=>{
  setupGeneration(true);(callLLM as jest.Mock).mockResolvedValue("回答");
  const events=(await (await POST(streamRequest())).text()).trim().split("\n").map(x=>JSON.parse(x));
  expect(events.at(-1).ok).not.toBe(true);expect(events.at(-1).error).toContain("未确认保存");
 });
 test("guarded answer is visible while persistence is still pending",async()=>{
  const q=setupGeneration();
  let finishSave!:(value:unknown)=>void;
  q.single.mockImplementation(()=>new Promise(resolve=>{finishSave=resolve;}));
  (callLLM as jest.Mock).mockImplementation(async(_m,o)=>{o.onDelta("正常回答。");return "正常回答。";});
  const reader=(await POST(streamRequest())).body!.getReader();
  let wire="";
  try{
   while(!wire.includes('"type":"delta"')){const chunk=await reader.read();if(chunk.done)throw Error("premature EOF");wire+=new TextDecoder().decode(chunk.value);}
   expect(wire).toContain("正常回答。");expect(wire).not.toContain('"type":"done"');
  }finally{finishSave({data:{id:"saved"}});}
  while(true){const chunk=await reader.read();if(chunk.done)break;wire+=new TextDecoder().decode(chunk.value);}
  const events=wire.trim().split("\n").map(x=>JSON.parse(x));
  expect(events.filter(e=>e.type==="delta")).toHaveLength(1);
  expect(events.at(-1)).toMatchObject({ok:true,id:"saved"});
 });
 test("auto retries timeout once on Flash before any output",async()=>{
  setupGeneration();(callLLM as jest.Mock).mockRejectedValueOnce(Error("Request timed out.")).mockResolvedValueOnce("回答");
  const events=(await (await POST(streamRequest())).text()).trim().split("\n").map(x=>JSON.parse(x));
  expect(callLLM).toHaveBeenCalledTimes(2);expect((callLLM as jest.Mock).mock.calls[1][1].model).toBe("deepseek-v4-flash");
  expect(events.at(-1)).toMatchObject({ok:true,learning_trace:{modelCalls:2,model:"deepseek-v4-flash"}});
 });
 test.each(["partial","explicit","balance"])("does not silently retry %s",async(kind)=>{
  setupGeneration();(callLLM as jest.Mock).mockImplementation(async(_m,o)=>{if(kind==="partial")o.onDelta("一部分");throw Error(kind==="balance"?"TokenPay 余额不足":"Request timed out.");});
  await (await POST(streamRequest(kind==="explicit"?"glm-5.3":"auto"))).text();
  expect(callLLM).toHaveBeenCalledTimes(1);
 });
 test("streamed unauthorized response never emits model text",async()=>{
  const response=await POST(new Request("https://example.com/api/coach/agent",{method:"POST",headers:{accept:"application/x-ndjson"},body:"{}"}));
  const events=(await response.text()).trim().split("\n").map(line=>JSON.parse(line));
  expect(events.at(-1)).toMatchObject({type:"done",error:"请先登录"});
  expect(events.some(e=>e.type==="delta")).toBe(false);
  expect(callLLM).not.toHaveBeenCalled();
 });
 test("unauthenticated history is denied",async()=>{expect((await GET(new Request("https://example.com/api/coach/agent"))).status).toBe(401);expect(getDbClient).not.toHaveBeenCalled();});
 test("malformed scope rejected",async()=>{(getCurrentUserFromRequest as jest.Mock).mockResolvedValue({id:"user"});expect((await GET(new Request("https://example.com/api/coach/agent?opportunityId=wrong"))).status).toBe(400);expect(getDbClient).not.toHaveBeenCalled();});
 test("empty submission rejected before database",async()=>{(getCurrentUserFromRequest as jest.Mock).mockResolvedValue({id:"user"});expect((await POST(new Request("https://example.com/api/coach/agent",{method:"POST",body:JSON.stringify({message:""})}))).status).toBe(400);expect(getDbClient).not.toHaveBeenCalled();});
 test("history is owner and scope filtered and uncached",async()=>{
  (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({id:"owner"});
  const q={select:jest.fn().mockReturnThis(),eq:jest.fn().mockReturnThis(),is:jest.fn().mockReturnThis(),order:jest.fn().mockReturnThis(),limit:jest.fn().mockResolvedValue({data:[],error:null})};
  (getDbClient as jest.Mock).mockResolvedValue({from:()=>q});
  const res=await GET(new Request("https://example.com/api/coach/agent"));expect(q.eq).toHaveBeenCalledWith("user_id","owner");expect(q.is).toHaveBeenCalledWith("opportunity_id",null);expect(res.headers.get("cache-control")).toContain("no-store");
 });
 test("retry reuses the persisted answer without another model call",async()=>{
  (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({id:"owner"});
  const q={select:jest.fn().mockReturnThis(),eq:jest.fn().mockReturnThis(),maybeSingle:jest.fn().mockResolvedValue({data:{id:"saved",answer:"已保存回复",opportunity_id:null},error:null})};
  (getDbClient as jest.Mock).mockResolvedValue({from:()=>q});
  const res=await POST(new Request("https://example.com/api/coach/agent",{method:"POST",body:JSON.stringify({message:"重试",requestId:"11111111-1111-4111-8111-111111111111"})}));
  expect(res.status).toBe(200);expect((await res.json()).answer).toBe("已保存回复");expect(callLLM).not.toHaveBeenCalled();expect(q.eq).toHaveBeenCalledWith("user_id","owner");
 });
 test("幂等重放保留缺料状态，但不向浏览器回传私有上下文快照",async()=>{
  const q=setupGeneration();
  q.maybeSingle.mockResolvedValue({data:{id:"saved",answer:"请补充具体回答",opportunity_id:null,learning_trace:{compiledPrompt:"完整内部上下文",insufficiency:{needsMoreInput:true,blocked:true}}}});
  const body=await (await POST(new Request("https://example.com/api/coach/agent",{method:"POST",body:JSON.stringify({message:"重试",requestId:"11111111-1111-4111-8111-111111111111"})}))).json();
  expect(body).toMatchObject({needsMoreInput:true,blocked:true});
  expect(JSON.stringify(body)).not.toContain("完整内部上下文");
  expect(callLLM).not.toHaveBeenCalled();
 });
 test("上一轮提问受保护，界面大段日志不能挤掉；真实输入另存供审计",async()=>{
  const q=setupGeneration();
  q.limit.mockResolvedValueOnce({data:[]}).mockResolvedValue({data:[{id:"previous",question:"我想学习RAG",answer:"先告诉我召回和排序有什么区别？",created_at:"2026-09-30T00:00:00Z"}]});
  (callLLM as jest.Mock).mockResolvedValue("我们先解释召回。");
  const body=await (await POST(new Request("https://example.com/api/coach/agent",{method:"POST",body:JSON.stringify({message:"我不会",pageContext:"界面日志".repeat(2000),requestId:"11111111-1111-4111-8111-111111111111"})}))).json();
  expect(body.ok).toBe(true);
  const saved=q.insert.mock.calls[0][0];
  expect(saved.learning_trace.compiledPrompt).toContain("先告诉我召回和排序有什么区别");
  expect(saved.learning_trace.materials.injected).toContainEqual(expect.objectContaining({kind:"pending_exchange",required:true,truncated:false}));
  expect(body.learning_trace.compiledPrompt).toBeUndefined();
 });
 test("a request id cannot reuse another opportunity's answer",async()=>{
  (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({id:"owner"});
  const q={select:jest.fn().mockReturnThis(),eq:jest.fn().mockReturnThis(),maybeSingle:jest.fn().mockResolvedValue({data:{id:"saved",answer:"private",opportunity_id:"22222222-2222-4222-8222-222222222222"},error:null})};
  (getDbClient as jest.Mock).mockResolvedValue({from:()=>q});
  const res=await POST(new Request("https://example.com/api/coach/agent",{method:"POST",body:JSON.stringify({message:"重试",requestId:"11111111-1111-4111-8111-111111111111"})}));
  expect(res.status).toBe(409);expect((await res.json()).answer).toBeUndefined();expect(callLLM).not.toHaveBeenCalled();
 });
 // §8.4 / B1：终止标准是装配出来的一条料，不是第二次模型调用，也不是界面模式按钮。
 test("本轮目标与收口标准进提示词，一轮仍只有一次模型调用",async()=>{
  setupGeneration();
  (callLLM as jest.Mock).mockResolvedValue("<answer>先讲这一句，然后你自己答一次。</answer>");
  const response=await POST(new Request("https://example.com/api/coach/agent",{method:"POST",body:JSON.stringify({message:"带我练一道 RAG 评估口径的题",requestId:"11111111-1111-4111-8111-111111111111"})}));
  const prompt=(callLLM as jest.Mock).mock.calls[0][0][1].content;
  expect(prompt).toContain("【本轮辅导目标与收口标准");
  expect(prompt).toContain("完成标准（v1）");
  expect(callLLM).toHaveBeenCalledTimes(1);
  expect((await response.json()).learning_trace.teaching).toMatchObject({intent:"practice",stage:"explain",priorAttempts:0,currentIsAttempt:false,scenarioAudited:false});
 });
 // §8.2：成果草稿是正文之外的独立事件——标签不外露、校验通过才成为可保存草稿。
 test("<outcome> 从不上线，成果随本轮一次落库并回到界面",async()=>{
  const q=setupGeneration();
  const attempt="我的理解是召回率看该找到的有没有找全，准确率看找出来对不对。";
  const raw='<answer>这一条成立。</answer><outcome>{"observedStatus":"独立完成过","openIssue":"独立迁移还没观察过","nextStep":"换个没给提示的场景再答一次"}</outcome>';
  (callLLM as jest.Mock).mockImplementation(async(_m,o)=>{o.onDelta(raw);return raw;});
  const events=(await (await POST(new Request("https://example.com/api/coach/agent",{method:"POST",headers:{accept:"application/x-ndjson"},body:JSON.stringify({message:attempt,requestId:"11111111-1111-4111-8111-111111111111"})}))).text()).trim().split("\n").map(x=>JSON.parse(x));
  // 只有可见文本事件上过线：模型的成果标签与内部 JSON 一个字都不能出现在那里。
  expect(events.filter((e: {type?: string})=>e.type==="delta"||e.type==="replace").map((e:unknown)=>JSON.stringify(e)).join("")).not.toContain("outcome");
  const done=events.at(-1);
  // 台账里这一轮真的跑过收口判定：intent/阶段/标准版本/尝试次数都要留痕。
  expect(done.learning_trace.teaching).toMatchObject({intent:"learn",stage:"feedback",criterionVersion:1,priorAttempts:0,currentIsAttempt:true,scenarioAudited:false});
  expect(done).toMatchObject({ok:true,answer:"这一条成立。",outcome:{answerDraft:attempt,observedStatus:"未独立检验",status:"draft",criterionVersion:1},outcomeNote:expect.stringContaining("没有全部回查")});
  expect(done.outcome.evidenceRefs).toEqual([`turn:${done.outcome.attemptTurnIds[0]}`,"criterion:v1"]);
  // 本轮 turn id 先生成：回查锚点指的就是这一行自己，刷新后还能找回同一张卡。
  const saved=q.insert.mock.calls[0][0];
  expect(saved.id).toMatch(/^[\da-f-]{36}$/);
  expect(saved.learning_trace.outcome.attemptTurnIds).toEqual([saved.id]);
 });
 // §6 B2「用户仅说懂了」：可以存笔记，但链路上不给出成果卡。
 test("没有本人作答就不出成果卡，正文照旧并说清那只算读过",async()=>{
  setupGeneration();
  (callLLM as jest.Mock).mockResolvedValue('<answer>这一步的关键是把目标写清楚。</answer><outcome>{"observedStatus":"提示下完成","openIssue":"还没迁移","nextStep":"再练一题"}</outcome>');
  const body=await (await POST(new Request("https://example.com/api/coach/agent",{method:"POST",body:JSON.stringify({message:"教我一个概念",requestId:"11111111-1111-4111-8111-111111111111"})}))).json();
  expect(body.ok).toBe(true);
  expect(body.answer).toContain("把目标写清楚");
  expect(body.outcome).toBeNull();
  expect(body.outcomeNote).toContain("读过");
 });
 test("成果标签里的 JSON 坏了：正文保留，本轮不形成成果",async()=>{
  setupGeneration();
  const attempt="我的理解是召回率看该找到的有没有找全，准确率看找出来对不对。";
  (callLLM as jest.Mock).mockResolvedValue(`<answer>这一条成立。</answer><outcome>${attempt}`);
  const body=await (await POST(new Request("https://example.com/api/coach/agent",{method:"POST",body:JSON.stringify({message:attempt,requestId:"11111111-1111-4111-8111-111111111111"})}))).json();
  expect(body.answer).toBe("这一条成立。");
  expect(body.outcome).toBeNull();
  expect(body.outcomeNote).toContain("没有通过校验");
});
});
