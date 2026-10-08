import {detectTeachingIntent,finalizeTeachingReply,isUserAttempt,renderTeachingFrame,teachingFrame,TEACHING_CRITERION_VERSION,type TeachingTurn} from "./teaching-frame";

test.each([false,true])("收尾尊重停止，模型追问或假完成不外露（已覆盖=%s）",criterionSatisfied=>{
 const frame=teachingFrame({message:"先这样，够了",turns:[]});
 const result=finalizeTeachingReply({...frame,criterionSatisfied},{answer:"<clarify level=\"blocking\">懂了是什么意思？你已经完全掌握了。</clarify>",suggestions:["必须继续迁移"]});
 expect(result.answer).toContain("先到这里");
 expect(result.answer).not.toMatch(/clarify|是什么意思|完全掌握|必须/);
 expect(result.suggestions).toEqual([]);
 expect(result.answer.includes("覆盖这道题")).toBe(criterionSatisfied);
});
test("讲解和实际作答不被模板替换",()=>{
 const frame=teachingFrame({message:"我的答案：资料只检索，写作只用出处",turns:[]});
 const reply={answer:"这个分工成立。",suggestions:["再练一题"]};
 expect(finalizeTeachingReply(frame,reply)).toBe(reply);
});

const A1="11111111-1111-4111-8111-111111111111";
const A2="22222222-2222-4222-8222-222222222222";
const turn=(id:string,question:string,answer:string,proactive=false):TeachingTurn=>({id,question,answer,proactive});

describe("B1：intent 从用户这句原话判，不靠界面模式按钮",()=>{
 test.each([
  ["把这段实习经历改写成一句能放进简历的话","revise"],
  ["先不学了，帮我改简历这句话","revise"],
  ["这段怎么改，看着不像我做的","revise"],
  ["这题你再让我练一遍","practice"],
  ["问我一个模拟面试问题","practice"],
  ["RAG 的召回率到底衡量什么","learn"],
  ["周报应该写多细","learn"],
 ])("%s → %s",(message,intent)=>expect(detectTeachingIntent(message)).toBe(intent));
});

describe("用户有没有真的开口作答（判不准就往漏认靠）",()=>{
 test.each(["懂了","好的","嗯嗯","收到！","明白了","可以","没问题"])("附和句「%s」不算尝试",text=>expect(isUserAttempt(text)).toBe(false));
 test.each(["那评估口径应该看哪几个指标？","讲讲上下文窗口","帮我写一版草稿"])("提问「%s」不算尝试",text=>expect(isUserAttempt(text)).toBe(false));
 test("只表态要写、内容还没写下，不算尝试",()=>expect(isUserAttempt("那我按你的说法自己写一遍")).toBe(false));
 test("表态之后接着写出了内容，算尝试",()=>expect(isUserAttempt("我试着答一下：召回率看该找到的有没有找全，准确率看找出来的对不对，线上先看这两个。")).toBe(true));
 test("自己在陈述答案，算尝试",()=>{
  expect(isUserAttempt("我的理解是：召回率看该找到的有没有找全，准确率看找出来对不对。")).toBe(true);
  expect(isUserAttempt("这样算的话，第二个 Agent 只要拿到目标就够了")).toBe(true);
 });
});

describe("B2：闭环阶段由用户原话决定，不由模型声明决定",()=>{
 test("第一轮还没让用户开口：explain，标准可检验",()=>{
  const frame=teachingFrame({message:"RAG 的评估口径到底看什么？",turns:[]});
  expect(frame).toMatchObject({intent:"learn",stage:"explain",currentIsAttempt:false,attemptTurnIds:[],criterionVersion:TEACHING_CRITERION_VERSION});
  expect(frame.criterion).toContain("不用看稿");
 });
 test("用户这一轮答了：feedback，本轮才是表现证据",()=>{
  const turns=[turn(A1,"RAG 的评估口径到底看什么？","先记住两个数：找得到多少、找回来的有多少是对的。你来用自己的话说一遍。")];
  const frame=teachingFrame({message:"我的理解是召回率看该找到的有没有找全，准确率看找出来对不对。",turns});
  expect(frame).toMatchObject({stage:"feedback",currentIsAttempt:true,attemptTurnIds:[]});
 });
 test("上一轮用户自己答过：那轮 id 进尝试证据",()=>{
  const turns=[turn(A1,"这段经历我这样写行不行：负责模型评测，覆盖准确率与延迟。","这一条动作与数字都有据。你再试着补上结果。"),turn(A2,"我的答案：设计准确率与延迟两项评测，跑了 3 个版本。","两项都对上了，这一条成立。")];
  const frame=teachingFrame({message:"那第二个数字要不要写进来？",turns});
  expect(frame.attemptTurnIds).toEqual([A1,A2]);
 });
 test("导师主动开口的那句永远不是用户的尝试",()=>{
  const turns=[turn(A1,"这题你怎么答？先说卡在哪儿。","上一轮你已经答过一半了。",true)];
  expect(teachingFrame({message:"继续",turns}).attemptTurnIds).toEqual([]);
 });
 test("用户仅说「懂了」：进收尾，不新造缺口",()=>{
  const turns=[turn(A1,"带我练一道 Agent 任务分工的题","你把两个 Agent 的边界说清了。"),turn(A2,"我的答案：按能不能失败来分两个 Agent。","对，这一条成立。")];
  expect(teachingFrame({message:"懂了",turns}).stage).toBe("closing");
 });
 test("用户开口收尾：closing",()=>{
  expect(teachingFrame({message:"今天到这吧，够了",turns:[]}).stage).toBe("closing");
 });
 test("长句里的「就够了」是在说内容，不算收尾",()=>{
  const frame=teachingFrame({message:"这样算的话，第二个 Agent 只要拿到目标就够了，不用再传一整段上下文。",turns:[]});
  expect(frame.stage).toBe("feedback");
 });
});

describe("B1：一个目标 + 一个可检验标准；改目标时切到新目标",()=>{
 test("目标沿用会话首问",()=>{
  expect(teachingFrame({message:"那第二段怎么办？",turns:[turn(A1,"教我怎么写这段实习经历","先分清动作与结果。")]}).goal).toBe("教我怎么写这段实习经历");
 });
 test("明确换题就切目标，原草稿留在原轮次里不丢",()=>{
  const frame=teachingFrame({message:"换个话题，先不学这个了，讲讲 RAG 的评估口径",turns:[turn(A1,"教我怎么写这段实习经历","先分清动作与结果。")]});
  expect(frame.goal).toContain("RAG");
 });
 test("标准模板随 intent 走",()=>{
  expect(teachingFrame({message:"把这段改写成一句能放进简历的话",turns:[]}).criterion).toContain("回到你给过的原话");
  expect(teachingFrame({message:"再让我练一遍这题",turns:[]}).criterion).toContain("独立答完这题");
 });
});

describe("B2：首批三个窄场景之外不给任何达标口径",()=>{
 test.each(["这段经历表达怎么改","RAG 的评估口径看什么","Agent 的任务分工与上下文边界"])(`场景内：%s`,message=>{
  expect(teachingFrame({message,turns:[]}).scenarioAudited).toBe(false);
 });
 test("场景外照旧正常对话，但料里明说不在评测覆盖内",()=>{
  const frame=teachingFrame({message:"周报应该写多细",turns:[]});
  expect(frame.scenarioAudited).toBe(false);
  expect(renderTeachingFrame(frame)).toContain("专项内容评测尚未签收");
 });
});

describe("§8.4：装配一次框架不产生任何模型调用",()=>{
 test("料里有目标、标准、阶段动作与尝试计数",()=>{
  const text=renderTeachingFrame(teachingFrame({message:"带我练一道 Agent 上下文边界的题",turns:[]}));
  expect(text).toContain("本次目标：");
  expect(text).toContain(`完成标准（v${TEACHING_CRITERION_VERSION}）：`);
  expect(text).toContain("讲解与邀请尝试");
  expect(text).toContain("还没有观察到用户本人作答");
 });
 test("收尾阶段写明不得虚构新缺口维持聊天",()=>{
  expect(renderTeachingFrame(teachingFrame({message:"先这样，够了",turns:[]}))).toContain("不虚构新缺口");
 });
 test("改材料的料不给练习动作",()=>{
  const text=renderTeachingFrame(teachingFrame({message:"把这段改写成一句能放进简历的话",turns:[]}));
  expect(text).toContain("改材料只给用户可直接使用的草稿");
 });
});
