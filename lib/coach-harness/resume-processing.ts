import type {ResumeTrace} from './resume-trace';

export interface ResumeProcessingSummary {
  traceId:string;
  outcome:ResumeTrace['outcome'];
  elapsedMs:number;
  stages:string[];
  materials:string[];
  knowledge:Array<{id:string;title:string}>;
  checks:Array<{label:string;status:'performed'|'passed'|'failed'}>;
  changedCount:number|null;
  saved:boolean;
}
const stageLabels:Record<ResumeTrace['steps'][number]['stage'],string>={context:'读取材料',retrieval:'检索写法参考',draft:'编辑尝试',grounding:'事实核对',review:'整稿检查',save:'保存',failure:'处理未完成'};
/** Allowlisted operational facts only. Never expose prompts, source text,
 * reasoning, rejected changes, quality scores or unverified “confirmed facts”. */
export function resumeProcessingSummary(trace:ResumeTrace,hasJd:boolean,saved:boolean):ResumeProcessingSummary {
  const steps=trace.steps||[],codes=new Set(steps.map(step=>step.code));
  const included=new Set(trace.retrieval.includedIds||[]);
  const knowledge=(trace.retrieval.documentTitles||[]).filter(item=>included.has(item.id)
    && typeof item.title==='string' && item.title.length<=100 && !/@|https?:|\d{11}/.test(item.title))
    .filter((item,index,all)=>all.findIndex(other=>other.id===item.id)===index).slice(0,8);
  const checks:ResumeProcessingSummary['checks']=[];
  if(steps.some(step=>step.stage==='grounding'))checks.push({label:'事实范围核对',status:trace.quality?.grounding?'passed':codes.has('no_grounded_change')?'failed':'performed'});
  if(codes.has('whole_document_checked')||codes.has('retained_document_rechecked'))checks.push({label:'整稿检查',status:codes.has('whole_document_unresolved')?'failed':trace.quality?.independentReview?'passed':'performed'});
  if(codes.has('original_document_checked_unchanged'))checks.push({label:'原稿保留检查',status:'passed'});
  if(codes.has('returned_to_original_editor')||codes.has('one_bounded_repair'))checks.push({label:'退回原编辑返修',status:'performed'});
  return {traceId:trace.traceId,outcome:trace.outcome,elapsedMs:Math.max(0,Number(trace.elapsedMs)||0),
    stages:[...new Set(steps.map(step=>stageLabels[step.stage]).filter(Boolean))],
    materials:steps.some(step=>step.stage==='context')?['当前简历',...(hasJd?['当前岗位 JD']:[])]:[],knowledge,checks,
    changedCount:saved&&trace.editingValue?.disposition==='revised'?trace.editingValue.useful:trace.outcome==='unchanged'?0:null,saved};
}
