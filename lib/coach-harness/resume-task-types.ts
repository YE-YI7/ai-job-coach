import type { ResumeChange, Opportunity } from "@/lib/opportunities/types";

export type ResumeQuestionField = "context" | "action" | "deliverable" | "outcome" | "scope";
export interface ResumeAgentQuestion {
  id: string;
  sourceExcerpt: string;
  question: string;
  field: ResumeQuestionField;
}
export interface ResumeAgentAnswer extends ResumeAgentQuestion {
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
  error?: string;
  result?: { changes: ResumeChange[]; applicationQuality?: Opportunity["applicationQuality"]; resumeGenerationId?: string; resumeCheckStale?:boolean };
}

/** 不把待回答、模型推断或“暂不补充”变成经历事实。 */
export function factualResumeAnswers(answers: ResumeAgentAnswer[]) {
  return answers.filter(item => !item.skipped && item.answer.trim());
}

function anchoredExcerpt(source:string,excerpt:string){
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
  const sourceExcerpt = anchoredExcerpt(source,String(value.sourceExcerpt || "").trim())||'';
  const question = String(value.question || "").trim();
  const field = String(value.field || "action") as ResumeQuestionField;
  if (!["context", "action", "deliverable", "outcome", "scope"].includes(field)
    || sourceExcerpt.length<12 || sourceExcerpt.length > 260 || !source.includes(sourceExcerpt)
    || /@|https?:|电话|邮箱|手机|\d{11}/.test(sourceExcerpt)
    || question.length < 8 || question.length > 220 || (question.match(/[？?]/g) || []).length > 1
    || /https?:|@|\d{11}/.test(question)) return null;
  // 同一处的同一事实维度最多问一次；答“不知道”也算已经回答，不追着索取数字。
  if (answers.some(answer => (answer.field === field && answer.sourceExcerpt === sourceExcerpt) || answer.question === question)) return null;
  const id = `${field}:${encodeURIComponent(sourceExcerpt)}`;
  return { id, sourceExcerpt, question, field };
}

/** A malformed planner response must not strand an otherwise readable résumé.
 * Ask one conservative factual question, never fabricate a model answer. */
export function fallbackResumeQuestion(source:string,answers:ResumeAgentAnswer[]){
  const questions:Record<ResumeQuestionField,string>={action:'这段经历里，你本人实际做的第一件事是什么？',deliverable:'这一步最后留下了什么具体材料或交付物？',context:'当时最需要解决的一个问题是什么？',outcome:'你交付的材料后来是怎么被使用的？',scope:'这件事里，哪些工作不是由你负责的？'};
  const lines=source.split(/\n+/).map(line=>line.trim()).filter(line=>line.length>=12&&line.length<=260&&/负责|参与|协助|完成|整理|制作|维护|搭建|设计|开发|运营/.test(line)&&!/@|https?:|电话|邮箱|手机|\d{11}/.test(line));
  for(const sourceExcerpt of lines)for(const field of Object.keys(questions) as ResumeQuestionField[]){const q=nextResumeQuestion(source,{sourceExcerpt,field,question:questions[field]},answers);if(q)return q;}
  return null;
}
