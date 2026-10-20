import type { ResumeChange, Opportunity } from "@/lib/opportunities/types";

export type ResumeQuestionField = "context" | "action" | "deliverable" | "outcome" | "scope";
export interface ResumeAgentQuestion {
  id: string;
  sourceExcerpt: string;
  question: string;
  field: ResumeQuestionField;
}
export interface ResumeAgentAnswer extends ResumeAgentQuestion {
  /** Editing directions are private context, never evidence of experience. */
  kind?: "instruction";
  answer: string;
  skipped?: boolean;
  savedAt: string;
  claimId?: string;
}
export interface ResumeAgentTask {
  id: string;
  state: "idle" | "running" | "needs_detail" | "ready" | "failed" | "stale";
  question: ResumeAgentQuestion | null;
  answers: ResumeAgentAnswer[];
  updatedAt: string;
  conversation?: ResumeConversationTurn[];
  error?: string;
  result?: { changes: ResumeChange[]; applicationQuality?: Opportunity["applicationQuality"]; resumeGenerationId?: string; resumeCheckStale?:boolean; summary?:string; unchanged?:boolean };
}

export interface ResumeConversationTurn {
  id: string;
  message: string;
  reply: string;
  status: "pending" | "completed" | "failed";
  decision?: "discuss" | "revise";
  savedAt: string;
}

/** 不把待回答、模型推断或“暂不补充”变成经历事实。 */
export function factualResumeAnswers(answers: ResumeAgentAnswer[]) {
  return answers.filter(item => item.kind !== "instruction" && !item.skipped && item.answer.trim());
}

export function anchoredResumeExcerpt(source:string,excerpt:string){
  if(source.includes(excerpt))return excerpt;
  // PDF extraction commonly uses ASCII punctuation and wraps a sentence.
  // Match only a unique normalized span, then retain the actual source bytes.
  const fold=(value:string)=>value.normalize('NFKC').replace(/\s/g,'');
  const needle=fold(excerpt);if(needle.length<12)return null;
  let normalized='',cursor=0;const starts:number[]=[],ends:number[]=[];
  for(const char of source){const folded=fold(char);for(let index=0;index<folded.length;index++){normalized+=folded[index];starts.push(cursor);ends.push(cursor+char.length);}cursor+=char.length;}
  const start=normalized.indexOf(needle);
  return start<0||normalized.indexOf(needle,start+1)>=0?null:source.slice(starts[start],ends[start+needle.length-1]);
}

export function nextResumeQuestion(source: string, raw: unknown, answers: ResumeAgentAnswer[]): ResumeAgentQuestion | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const sourceExcerpt = anchoredResumeExcerpt(source,String(value.sourceExcerpt || "").trim())||'';
  let question = String(value.question || "").trim();
  const field = String(value.field || "action") as ResumeQuestionField;
  if (!["context", "action", "deliverable", "outcome", "scope"].includes(field)
    || sourceExcerpt.length<12 || sourceExcerpt.length > 260 || !source.includes(sourceExcerpt)
    || /^(?:意向|求职意向|求职方向|目标方向|职业目标|姓名|教育背景|技能)\s*[:：]/.test(sourceExcerpt)
    || /@|https?:|电话|邮箱|手机|\d{11}/.test(sourceExcerpt)
    || question.length < 8 || question.length > 220 || (question.match(/[？?]/g) || []).length > 1
    || /https?:|@|\d{11}/.test(question)) return null;
  // 同一处的同一事实维度最多问一次；答“不知道”也算已经回答，不追着索取数字。
  if (answers.some(answer => (answer.field === field && answer.sourceExcerpt === sourceExcerpt) || answer.question === question)) return null;
  // A single question mark can still hide several questions. Keep one factual
  // slot; use a clear anchored fallback rather than repeatedly rejecting it.
  if((question.match(/什么|哪些|多少|怎么|如何|为何|为什么|哪[一份个种项]/g)||[]).length>1
    || /(?:动作|工作|做法).{0,6}[与和及].{0,6}(?:交付|成果|结果)|例如|比如|是否.{0,24}、/.test(question)){
    question=RESUME_FACT_QUESTIONS[field];
  }
  const id = `${field}:${encodeURIComponent(sourceExcerpt)}`;
  return { id, sourceExcerpt, question, field };
}

const RESUME_FACT_QUESTIONS:Record<ResumeQuestionField,string>={action:'这段经历里，你本人实际做的第一件事是什么？',deliverable:'这一步最后留下了什么具体材料或交付物？',context:'当时最需要解决的一个问题是什么？',outcome:'你交付的材料后来是怎么被使用的？',scope:'这段经历中，你具体负责哪一部分？'};

export function isVagueResumeResponsibility(text:string){
  // A note such as “具体个人交付还没梳理” is an admission of missing
  // detail, not evidence of having 梳理/交付. Removing that note alone must
  // not turn a vague responsibility into a supposedly useful paid rewrite.
  const factual = text.split(/[，,；;。！!\n]/).filter(clause=>
    !/^\s*(?:(?:具体|个人|本人|我的|实际|最后|最终)\s*)*(?:交付|动作|做了什么|工作).{0,12}(?:未梳理|没梳理|不清楚|记不清|不知道)/.test(clause)
  ).filter(Boolean).join('，');
  return /(?:负责|参与|协助|从事).{0,20}(?:相关工作|一些工作|日常工作|需求工作|运营工作|产品工作)\s*$/.test(factual)
    &&!/(?:整理|记录|核对|制作|更新|编写|开发|测试|评测|设计|维护|排查|分析|审核|处理|收集|访谈|交付|提交|交给|接待|跟进)/.test(factual);
}

/** Ask for an explicit gap or a clearly vague responsibility after safe edits have been attempted.
 * A generic generation failure must not be blamed on the user's materials. */
export function explicitMissingResumeQuestion(source:string,answers:ResumeAgentAnswer[]){
  if(answers.length)return null;
  for(const line of source.split(/\n+/)){
    const explicit=/(?:交付|动作|做了什么|具体.{0,4}工作).{0,12}(?:未梳理|没梳理|不清楚|记不清|不知道)/.test(line);
    // A role label is not an action. Do not require the user to literally say
    // “I lack evidence” before asking about “参与需求相关工作”. Concrete ordinary
    // work remains editable without numbers, outcomes or external proof.
    const vague=isVagueResumeResponsibility(line);
    if(!explicit&&!vague)continue;
    const field=/交付/.test(line)?'deliverable':'action';
    const question=nextResumeQuestion(source,{sourceExcerpt:line.trim(),field,question:RESUME_FACT_QUESTIONS[field]},answers);
    if(question)return question;
  }
  return null;
}

/** A malformed planner response must not strand an otherwise readable résumé.
 * Ask one conservative factual question, never fabricate a model answer. */
export function fallbackResumeQuestion(source:string,answers:ResumeAgentAnswer[]){
  const questions=RESUME_FACT_QUESTIONS;
  const lines=source.split(/\n+/).map(line=>line.trim()).filter(line=>line.length>=12&&line.length<=260&&/负责|参与|协助|完成|整理|制作|维护|搭建|设计|开发/.test(line)&&!/^(?:意向|求职|目标|方向|姓名|教育|技能|学校|学历)\s*[:：]/.test(line)&&!/@|https?:|电话|邮箱|手机|\d{11}/.test(line));
  for(const sourceExcerpt of lines)for(const field of Object.keys(questions) as ResumeQuestionField[]){const q=nextResumeQuestion(source,{sourceExcerpt,field,question:questions[field]},answers);if(q)return q;}
  return null;
}
