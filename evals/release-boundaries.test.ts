import {teachingFrame} from "@/lib/coach-harness/teaching-frame";
import {decisionEntityKey,decisionForUrl,type JobDecision} from "@/lib/jobs/job-decision";
import {groupCandidates} from "@/lib/jobs/result-presentation";
const A="11111111-1111-4111-8111-111111111111";
const B="22222222-2222-4222-8222-222222222222";
test("换目标第三轮和第四轮都不能回到旧目标；尝试只属于当前标准",()=>{
 const turns=[
  {id:A,question:"讲讲 RAG 的评估口径",answer:"你来解释召回率",teaching:{intent:"learn" as const,goal:"讲讲 RAG 的评估口径",criterionVersion:1,currentIsAttempt:false}},
  {id:B,question:"先不学了，帮我改简历这句话",answer:"请补你的动作",teaching:{intent:"revise" as const,goal:"先不学了，帮我改简历这句话",criterionVersion:2,currentIsAttempt:false}},
 ];
 const third=teachingFrame({message:"我主要负责需求文档和工单归类，没有做开发",turns});
 expect(teachingFrame({message:turns[1].question,turns:[turns[0]]}).intent).toBe("revise");
 expect(third).toMatchObject({intent:"revise",goal:"先不学了，帮我改简历这句话",criterionVersion:2,attemptTurnIds:[]});
 const fourth=teachingFrame({message:"这样写可以吗",turns:[...turns,{id:A,question:"补充真实负责的工作",answer:"草稿",teaching:third}]});
 expect(fourth).toMatchObject({intent:"revise",goal:third.goal,criterionVersion:2});
});
test("解释困惑、附和、被历史长度规则误标的提问都不是用户的答案",()=>{
 const frame=teachingFrame({message:"懂了",turns:[{id:A,question:"这段 RAG 原理我看了很久还是没有理解，能不能换一个简单例子讲讲",answer:"例子如下"}]});
 expect(frame).toMatchObject({stage:"explain",attemptTurnIds:[],currentIsAttempt:false});
});
test("持久化标记 false 不得被长句覆盖；新题不继承旧尝试",()=>{
 const turns=[{id:A,question:"我的答案：上一个目标的回答",answer:"你来再说一次",teaching:{currentIsAttempt:false}}];
 expect(teachingFrame({message:"换个话题，讲讲 RAG",turns})).toMatchObject({currentIsAttempt:false,attemptTurnIds:[]});
});
test("标准覆盖后不给用户虚构下一项必修缺口",()=>{
 expect(teachingFrame({message:"继续",turns:[{id:A,question:"我的答案：用相关材料总数做分母",answer:"本题覆盖",teaching:{currentIsAttempt:true,criterionSatisfied:true}}]}).stage).toBe("closing");
});
test("同链接不同批次不能显示为本批已经表态",()=>{
 const url="https://example.com/job/1";
 expect(decisionEntityKey(url,A)).not.toBe(decisionEntityKey(url,B));
 const old={url,batchRunId:A,claimId:"old"} as JobDecision;
 expect(decisionForUrl([old],url,B)).toBeUndefined();
});
test.each([[0,1],[1,4],[3,2],[5,2]])("优先 %i / 未知 %i 真正分组",(pass,unknown)=>{
 const jobs=[...Array.from({length:unknown},()=>({review:{eligibility:"unknown"}})),...Array.from({length:pass},()=>({review:{eligibility:"pass"}})),{review:{eligibility:"conflict"}}];
 const grouped=groupCandidates(jobs);
 expect(grouped.lead).toHaveLength(Math.min(3,pass));
 expect(grouped.rest).toHaveLength(Math.max(0,pass-3));
 expect(grouped.unknown).toHaveLength(unknown);
});
