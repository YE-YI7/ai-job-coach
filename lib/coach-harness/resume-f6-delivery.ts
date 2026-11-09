import type {ResumeChange, ResumeEvidenceNotice} from '@/lib/opportunities/types';
import {verifyResumeGrounding, type GroundingSource} from './citation-verifier';
import {resolveResumeSourceIds} from './resume-source-ids';
import {f6MetricDirectionNumbers} from './resume-f6-writer';

// Formatting equivalence only. These comparisons never certify the meaning,
// attribution, denominator, causality or outcome of a number.
const NUMBER = /(?<![A-Za-z\d])(?:[¥￥$]?\d{1,3}(?:[,，]\d{3})+(?:\.\d+)?|[¥￥$]?\d+(?:\.\d+)?)(?:\s*(?:个百分点|百分点|pp|%|ms|毫秒|分钟|小时|个月|万|亿|人|次|年|天|元|条|场|个))?/gi;
const DATE = /((?:19|20)\d{2})\s*(?:年\s*|[./-])(0?[1-9]|1[0-2])\s*月?(?!\d)/g;
function numberKey(value:string){
  return value.normalize('NFKC').replace(/[,，\s]/g,'').toLowerCase()
    .replace(/个百分点|百分点|pp/g,'pp').replace(/毫秒/g,'ms')
    .replace(/[人次条场个]$/,'');
}
function numberSpans(text:string){
  return [...text.matchAll(NUMBER)].filter(match=>{
    // List ordinals are document structure, not résumé facts.
    const lineStart=text.lastIndexOf('\n',match.index!-1)+1;
    return !/^\s*$/.test(text.slice(lineStart,match.index))
      || !/^[.)、]\s/.test(text.slice(match.index!+match[0].length));
  });
}

/** Same frozen author text, no rewriting and no return-to-author instruction.
 * A notice means the mechanical lookup did not find evidence, not fabrication. */
export function f6EvidenceNotices(candidate:string,sources:GroundingSource[]):ResumeEvidenceNotice[]{
  const sourceText=sources.map(source=>source.text).join('\n');
  const allowed=new Set(numberSpans(sourceText).map(match=>numberKey(match[0])));
  const sourceDates=[...sourceText.matchAll(DATE)].map(match=>`${match[1]}.${Number(match[2])}`);
  for(const match of sourceText.matchAll(DATE))allowed.add(match[1]);
  const notices:ResumeEvidenceNotice[]=[];
  const add=(code:ResumeEvidenceNotice['code'],quote:string,start:number,message:string)=>{
    if(!quote||start<0||candidate.slice(start,start+quote.length)!==quote)return;
    if(!notices.some(item=>item.code===code&&item.start===start&&item.end===start+quote.length)){
      notices.push({code,quote,start,end:start+quote.length,message});
    }
  };
  const dates=[...candidate.matchAll(DATE)];
  for(const date of dates){
    if(!sourceDates.includes(`${date[1]}.${Number(date[2])}`))
      add('number_not_found',date[0].trimEnd(),date.index!,'这处日期在原材料里没找到，请确认。');
  }
  for(const match of numberSpans(candidate)){
    if(dates.some(date=>match.index!>=date.index!&&match.index!<date.index!+date[0].length))continue;
    if(!allowed.has(numberKey(match[0])))add('number_not_found',match[0],match.index!,
      '这处数字或口径在原材料里没找到，请确认；按日期推算的年限也请核对。');
  }
  const directionNumbers=new Set(f6MetricDirectionNumbers(sourceText,candidate));
  if(directionNumbers.size){
    for(const match of numberSpans(candidate))if(directionNumbers.has(numberKey(match[0])))
      add('qualifier_changed',match[0],match.index!,'这处数值可能丢失了增减方向或原有口径，请确认。');
  }
  for(const clause of candidate.matchAll(/[^，,；;。！？!?\n]+/g)){
    const report=verifyResumeGrounding({candidateText:clause[0],sources});
    for(const verdict of report.verdicts){
      if(verdict.status!=='rejected'||!['action_not_supported','negation_or_hedge_dropped'].includes(verdict.reason))continue;
      const {text,start}=verdict.offendingSpan;
      add(verdict.reason==='negation_or_hedge_dropped'?'qualifier_changed':'wording_not_found',text,clause.index!+start,
        verdict.reason==='negation_or_hedge_dropped'
          ?'这处责任或完成状态可能与原材料不同，请确认。'
          :'这处表述在原材料里没找到依据，请确认。');
    }
  }
  return notices.sort((a,b)=>a.start-b.start||a.end-b.end);
}

/** Host projection remains authoritative for location and reversibility.
 * Content quality, keyword matches and numeric matches cannot drop a hunk. */
export function f6DeliveryChanges(source:string,raw:Record<string,unknown>[],options:{
  allowedIds:Set<string>;idFor:(before:string,index:number)=>string;inScope?:(before:string)=>boolean;
}){
  const rejected:Array<{index:number;reasons:string[]}>=[];
  const changes=raw.flatMap((item,index):ResumeChange[]=>{
    const before=String(item.before||''),after=String(item.after??'');
    const reasons=[...(!before||!source.includes(before)?['修改原文无法在当前简历定位']:[]),
      ...(options.inScope&&!options.inScope(before)?['修改越过已授权范围']:[])];
    if(reasons.length){rejected.push({index,reasons});return [];}
    const ids=resolveResumeSourceIds(item.sourceIds,options.allowedIds).ids;
    return [{id:options.idFor(before,index),section:String(item.section||'整稿选材与重构').slice(0,100),
      before,after,reason:String(item.reason||'作者交付的修改，待你确认。').slice(0,500),
      evidenceId:ids[0]||null,evidenceIds:ids,status:'pending'}];
  });
  return {changes,rejected};
}

export function annotateF6Changes(changes:ResumeChange[],sources:GroundingSource[]){
  return changes.map(change=>change.status==='pending'
    ?{...change,evidenceNotices:f6EvidenceNotices(change.after,sources)}:change);
}
