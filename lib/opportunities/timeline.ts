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
