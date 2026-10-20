import type {ResumeAgentTask} from '../lib/coach-harness/resume-task-types';
const resume='林舟｜产品助理\n校园工具项目：参与需求调研，收集同学反馈并整理记录。\n运营实习：每天使用 Excel 整理订单数据，制作周报交给店长查看。';
const question={id:'delivery',sourceExcerpt:'校园工具项目：参与需求调研，收集同学反馈并整理记录。',question:'这一步最后留下了什么具体材料或交付物？',field:'deliverable' as const};
const base:ResumeAgentTask={id:'fixture-only',state:'ready',question:null,answers:[],updatedAt:'2026-10-20T00:00:00.000Z',result:{changes:[]}};
export const resumeConversationFixtures=[
 {id:'explain-wording',resume,task:base,message:'你为什么建议把锻炼了沟通能力删掉？先给我解释一下。',expected:'discuss'},
 {id:'explicit-wait',resume,task:base,message:'先不要修改，我们讨论一下写产品助理还是运营方向更好。',expected:'discuss'},
 {id:'question-about-question',resume,task:{...base,state:'needs_detail',question},message:'你说的交付物是什么意思？这和结果有什么区别？',expected:'discuss'},
 {id:'uncertain-data',resume,task:{...base,state:'needs_detail',question},message:'我不知道这个指标怎么算，你能先讲一下吗，别写进简历。',expected:'discuss'},
 {id:'explicit-edit',resume:resume.replace('每天使用 Excel 整理订单数据，制作周报交给店长查看。','每天会使用 Excel 把每天的订单数据整理一下，然后再把订单数据做成周报，周报做好后会交给店长查看，主要是让店长每周能查看订单数据。'),task:base,message:'把运营实习那段精简一下，突出 Excel 周报交给店长这个交付，不加任何新事实。',expected:'revise',executeEditor:true},
 {id:'use-real-answer',resume,task:{...base,state:'needs_detail',question},message:'我把同学反馈整理成 Excel 分类表，交给负责排需求的同学看。',expected:'revise',executeEditor:true},
 {id:'resume-discussion-then-edit',resume,task:{...base,conversation:[{id:'previous-user',message:'我把同学反馈整理成 Excel 分类表，交给负责排需求的同学看。',reply:'可以保留参与职责，突出分类表和用途。',status:'completed' as const,decision:'discuss' as const,savedAt:'2026-10-20T00:00:00.000Z'}]},message:'好，就按刚才讨论的把这段写到简历上，别改成我主导项目。',expected:'revise'},
 {id:'hypothetical-not-fact',resume,task:base,message:'如果我把周报做成自动看板是不是更好？现在只是想想，还没做，先不改简历。',expected:'discuss'},
] as const;
