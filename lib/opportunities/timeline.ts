import type {Opportunity} from "./types";
export const journeyStages = [
 {id:"overview",label:"项目准备"},{id:"resume",label:"简历修改"},
 {id:"activity",label:"投递跟踪"},{id:"interview",label:"模拟面试"},
 {id:"review",label:"面试复盘"},{id:"salary",label:"谈薪"},
] as const;
export type JourneyStage=typeof journeyStages[number]["id"];
export function currentJourneyStage(o:Opportunity):JourneyStage {
 if(o.stage==="negotiating"||o.stage==="won")return "salary";
 if(o.stage==="interviewing")return "interview";
 if(o.stage==="applied")return "activity";
 if(o.stage==="preparing_application"||o.resumeText?.trim())return "resume";
 return "overview";
}
export function resumeGate(o:Opportunity){
 const frozen=o.snapshots?.filter(s=>s.snapshotType==="submitted_resume").sort((a,b)=>b.version-a.version)[0];
 const pending=o.resumeChanges.filter(c=>c.status==="pending").length;
 const review=o.applicationQuality?.reviews.find(r=>r.status==="failed");
 const ready=o.workspaceType!=="preparation"&&Boolean(o.resumeText?.trim()&&o.jdText?.trim())&&o.applicationQuality?.status==="ready"&&!pending;
 return {frozen,ready,reason:o.workspaceType==="preparation"?"准备阶段无需 JD，可以先完善经历和基础简历":!o.resumeText?.trim()?"还没有简历":!o.jdText?.trim()?"还没有这个岗位的 JD":pending?`${pending} 处修改待你确认`:review?.summary||(!ready?"尚未完成投递质检":"质检通过，可以冻结投递版")};
}

// —— 轮次归一化：模拟面试与面试复盘共用同一套「第几面」语义 ——
// 以前面试侧只有题型（业务面/技术面…），复盘侧才有轮次（一面/二面…），两条线各说各话。
// 轮次轴统一为「第几面/第几轮」：用户可以自填任意数字（可 >3），也接受 电话初筛 / 终面 / HR面 这类惯用叫法。
export const phoneScreeningLabel="电话初筛";
const cnDigits:Record<string,number>={一:1,二:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10,两:2};
const cnOrdinalChars=["一","二","三","四","五","六","七","八","九","十"];

export function chineseOrdinalToNumber(text:string):number|null{
 if(cnDigits[text]!==undefined)return cnDigits[text];
 const m=text.match(/^([一二两])?十([一二三四五六七八九])?$/);
 if(!m)return null;
 const tens=cnDigits[m[1]??"一"];
 const ones=m[2]?cnDigits[m[2]]:0;
 return tens*10+ones;
}

/** 从「3 / 3面 / 第3面 / 第3轮 / 三面 / 五」提取轮次序号（1-99）；不识别返回 null。 */
export function parseRoundOrdinal(input:string|number|null|undefined):number|null{
 if(typeof input==="number")return Number.isInteger(input)&&input>=1&&input<=99?input:null;
 const text=String(input??"").trim().replace(/\s+/g,"").replace(/^第/,"").replace(/[面轮场]$/,"");
 if(!text)return null;
 if(/^\d{1,2}$/.test(text)){const n=Number(text);return n>=1&&n<=99?n:null;}
 return chineseOrdinalToNumber(text);
}

/** 序号 → 展示标签：0=电话初筛，1-10=一面…十面，>10=第N面。 */
export function formatRoundLabel(ordinal:number):string{
 if(ordinal<=0)return phoneScreeningLabel;
 if(ordinal<=10)return `${cnOrdinalChars[ordinal-1]}面`;
 return `第${ordinal}面`;
}

/** 任意写法（含简繁、空格、"第几面/第几轮"）→ 统一标签；识别不了返回 null，由 UI 如实提示。 */
export function normalizeRoundLabel(input:string|null|undefined):string|null{
 const text=String(input??"").trim().replace(/\s+/g,"");
 if(!text)return null;
 if(/^hr面$/i.test(text))return "HR面";
 if(text===phoneScreeningLabel||text==="电话初筛"||text==="初筛"||text==="初篩")return phoneScreeningLabel;
 if(text==="终面"||text==="終面")return "终面";
 const ordinal=parseRoundOrdinal(text);
 return ordinal===null?null:formatRoundLabel(ordinal);
}

// —— 简历投递线：一条进度条 + 一个当前动作，替代多处重复的「确认→检查→冻结→导出」 ——
export type ResumeStepState="done"|"active"|"waiting";
export type ResumeProgressAction="generate"|"confirm"|"check"|"freeze"|"export";
export function resumeProgress(o:Opportunity):{steps:Array<{id:string;label:string;state:ResumeStepState}>;action:ResumeProgressAction;hint:string;frozenVersion:number|null;pending:number}{
 const gate=resumeGate(o);
 const total=o.resumeChanges.length;
 const pending=o.resumeChanges.filter(c=>c.status==="pending").length;
 const checked=o.applicationQuality?.status==="ready"&&total>0;
 const checkedClean=checked&&pending===0; // 检查过、且没有新的待确认修改，才算「版本已检查」
 const frozen=Boolean(gate.frozen);
 const steps=[
  {id:"confirm",label:"确认建议",state:(!total?"waiting":pending?"active":"done")as ResumeStepState},
  {id:"check",label:"检查版本",state:(checkedClean?"done":!total||pending?"waiting":"active")as ResumeStepState},
  {id:"freeze",label:"冻结导出",state:(frozen?"done":checkedClean?"active":"waiting")as ResumeStepState},
 ];
 const action:ResumeProgressAction=!total?"generate":pending>0?"confirm":!checked?"check":!frozen?"freeze":"export";
 const hints:Record<ResumeProgressAction,string>={
  generate:"先生成一版岗位建议，再逐条决定。",
  confirm:`还有 ${pending} 处建议等你决定：采用、自己改或保留原文。`,
  check:"逐条确认完成后，做一次事实与岗位检查。",
  freeze:"检查通过。确认后冻结投递版本，避免误投旧版。",
  export:"版本已冻结：导出后用真实 PDF 校验文字层，这步只能你来完成。",
 };
 return {steps,action,hint:hints[action],frozenVersion:gate.frozen?.version??null,pending};
}
