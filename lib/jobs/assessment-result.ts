import type { Opportunity } from '@/lib/opportunities/types';
import type { ReviewedJob } from './personalization';
/** Reuse the paid search review; never call another model to classify a known JD. */
export function opportunityFromReviewedJob(job: ReviewedJob, resume: string): Omit<Opportunity,'id'> {
 const risk=job.review.decisionRisk;
 const ready=job.review.eligibility==='pass'&&!risk;
 return {workspaceType:'job',company:job.company,role:job.title,location:job.location,
 jdText:`来源：${job.url}\n\n${job.description}`,resumeText:resume,stage:'evaluating',stageLabel:'评估中',priority:'medium',
 sourceLabel:'搜岗评审',capturedAtLabel:'刚刚',nextEventLabel:'核对投递条件',
 recommendation:ready?'apply':'prepare_then_apply',recommendationLabel:ready?'值得推进':'先补充或核实',
 recommendationReason:[job.review.fitReason,risk?.text].filter(Boolean).join('\n'),
 evidenceCoverage:{strong:0,weak:job.review.resumeRefs.length?1:0,missing:job.review.resumeRefs.length?0:1,unverified:0},
 requirements:[{id:'search-review',requirement:job.review.requirementRefs.map(r=>r.text).join('\n'),importance:'critical',strength:job.review.resumeRefs.length?'weak':'missing',evidence:job.review.resumeRefs.map(r=>r.text).join('\n')||'尚无直接经历证据',source:job.review.resumeRefs.length?'基础简历原文':null,verified:false}],
 actions:[{id:'search-next',title:risk?.text||'核对招聘原文后决定是否投递',reason:'这是已有搜岗评审的判断，不等于已投递或录用概率。',dueLabel:'投递前',priority:'high',status:'todo'}],
 activities:[{id:'search-review-saved',actor:'analysis',title:'保存搜岗投递判断',detail:'复用已有评审，不额外调用模型或扣额度。',timeLabel:'刚刚'}],resumeChanges:[],interviewFocus:[]};
}
