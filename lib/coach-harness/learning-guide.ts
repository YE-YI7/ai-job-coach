import type {MentorNextAction} from "./next-action";
export function learningGuide(action:MentorNextAction|null|undefined){
 const interview=action?.tab==="interview"||action?.tab==="review";
 let title=interview?"把一个回答练到经得住追问":"把一段真实经历讲清楚";
 const reason=action?.reason||"先找一个你想改善的具体问题，不需要准备完整简历。";
 const base={title,reason,
  steps:interview?["先用一个短示范看懂回答结构","回答一道与你材料有关的题","根据具体反馈修改，再做一次追问"]:["选一件你亲自做过的事，不要求大项目","一起补清目标、你的判断和可核实结果","产出一段自己的回答，再检查哪里还说不清"],
  example:interview?"不只背“背景—行动—结果”。练习解释：为什么选这个方案？还有什么替代方案？结果怎么验证？":"不要只写“负责优化体验”。先回答：谁遇到了什么问题？你亲自改了什么？怎么知道有效？没测过的数字就留空。",
  prompt:`请围绕当前建议开展一对一辅导：${reason}。先判断这是能力缺口还是材料缺口，不要把缺证据当成不会。给一个具体短例子，再让我做一道练习；根据我的回答反馈并追问，不要只列学习清单。`,
 };
 const subject=`${action?.title||""} ${reason}`;
 // 从实际分析暴露的问题选教学支架；不是给所有人同一张补材料清单。
 if(/评测|评估集|准确率|幻觉|回滚|guardrail|fallback/i.test(subject)){
  title="做一份能发现错误的评测样本";
  base.steps=["选定一个真实任务，定义什么算错","写正常、边界和高风险各一个样本","用样本检查输出，并解释什么时候人工接管"];
  base.example="练习：会议助手把“下周再看看”写成已承诺待办。你会把它判成什么错误？原话、预期输出和失败代价分别是什么？";
 }else if(/指标|实验|归因|转化|AB|A\/B/i.test(subject)){
  title="把一个指标拆到能验证的程度";
  base.steps=["说清谁的什么行为、分子和分母","提出两个可能原因及各自证据","设计最小验证，检查误判风险"];
  base.example="练习：报名人数没变，报名率下降。先检查访问人数和统计口径，不能直接归因页面改版。你会先查哪份数据？";
 }else if(/谈薪|薪资|offer|条款/i.test(subject)){
  title="练清楚一次薪资沟通";
  base.steps=["区分已确认条款、个人底线和未知项","拟一段询问条款的短消息","模拟对方回复，再练一次有依据的协商"];
  base.example="先问“方便确认奖金的发放条件和口径吗？”，不要把口头目标奖金当作保证收入，也不编造竞争 offer。";
 }else if(/目标岗位|方向|值得|投递判断/.test(subject)){
  title="用一个小案例判断岗位是否适合";
  base.steps=["把岗位要求翻译成日常会做的事","选一项任务试着做，不先给自己打分","对照体验与真实经历，决定下一步投入"];
  base.example="“负责用户增长”可能意味着分析漏斗，也可能意味着执行活动。先找 JD 中的具体产出，再问团队，而不是只看岗位名。";
 }
 return {...base,title,prompt:`本次练习：${title}。${base.prompt}\n教学支架：${base.steps.join("；")}。示例仅用于教学：${base.example}`};
}
