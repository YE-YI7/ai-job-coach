import {estimateTokens} from './context';
import {getDbClient} from '@/lib/db';
export const EVIDENCE_RETRIEVAL_VERSION='owned-raw-recall-v1';
export function evidenceTerms(query:string):string[]{
 const terms=new Set<string>();
 for(const word of query.toLowerCase().match(/[a-z][a-z0-9_-]{1,}|[\p{Script=Han}]{2,}/gu)||[]){
  if(!/\p{Script=Han}/u.test(word))terms.add(word);
  else for(let i=0;i<word.length-1;i++)terms.add(word.slice(i,i+2));
 }
 return [...terms].slice(0,32);
}
function score(text:string,terms:string[]){return terms.reduce((sum,term)=>sum+Number(text.toLowerCase().includes(term)),0);}
/** 完整原句选取，含原始行号；不改写、不删除原简历，不把片段冒充全量审稿。 */
export function selectResumeEvidence(text:string,query:string,maxTokens=1100){
 if(estimateTokens(text)<=maxTokens)return {text,partial:false};
 const terms=evidenceTerms(query);
 const ranked=text.split('\n').map((line,index)=>({line,index,score:score(line,terms)})).filter(r=>r.line.trim()).sort((a,b)=>b.score-a.score||a.index-b.index);
 const kept:typeof ranked=[];let used=0;
 for(const r of ranked){const cost=estimateTokens(r.line)+12;if(used+cost<=maxTokens){kept.push(r);used+=cost;}}
 kept.sort((a,b)=>a.index-b.index);
 return {text:kept.map(r=>`原简历第${r.index+1}行：${r.line}`).join('\n'),partial:true};
}
type RecalledTurn={id:string;question:string;answer:string;opportunity_id:string|null;created_at:string};
export async function recallLearningHistory(userId:string,sessionId:string,query:string,recentIds:string[]){
 const db=await getDbClient();if(!db)throw Error('历史检索不可用');
 const {data,error}=await db.rpc('search_coach_learning_history',{p_user_id:userId,p_session_id:sessionId,p_terms:evidenceTerms(query),p_exclude_ids:recentIds});
 if(error)throw error;
 let used=0;const parts:string[]=[];const included:string[]=[];
 for(const t of (data||[]) as RecalledTurn[]){
  const head=`历史原话 turn:${t.id}；岗位:${t.opportunity_id||'通用'}；时间:${t.created_at}。跨岗仅作衔接，不能充当本岗位事实。\n用户：${t.question}`;
  const withAnswer=`${head}\n导师（历史推断，非用户事实）：${t.answer}`;
  const text=used+estimateTokens(withAnswer)<=1400?withAnswer:head;
  if(used+estimateTokens(text)>1400)continue;
  parts.push(text);included.push(t.id);used+=estimateTokens(text);
 }
 return {text:parts.join('\n\n'),ids:included};
}
