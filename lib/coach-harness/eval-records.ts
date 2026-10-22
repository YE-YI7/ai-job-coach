import { createHash } from 'node:crypto';
import { evalUuid } from './eval-feedback';
import { redactEval } from './eval-scope';

export const RECORD_TYPE = 'development_log';
export const RECORD_VERSION = 'yizhi.eval-record/v1';
export type EvidenceAvailability = 'retained' | 'excerpt' | 'fixture' | 'metadata' | 'missing';
export type EvidenceSection = { id:string; label:string; availability:EvidenceAvailability; source:string; format:'text'|'json'; content:string|null };
export type EvidenceBlock = { id:string; title:string; kind:'input_output'|'quality'|'repair'|'result'|'release'; summary:string; traceIds:string[]; changeIds:string[]; sections:EvidenceSection[] };
export type EvalRecord = { schemaVersion:typeof RECORD_VERSION; id:string; title:string; summary:string; kind:'bugfix'|'feature'|'evaluation'; status:'verified'|'blocked'|'partial'; tags:string[]; versions:string[]; limitations:string[]; blocks:EvidenceBlock[]; attachments:Array<{id:string;name:string;base64:string;sha256:string;bytes:number}> };
export type RecordIndex = {summary:string;kind:EvalRecord['kind'];status:EvalRecord['status'];tags:string[];versions:string[];traceIds:string[];changeIds:string[];blockTitles:string[]};
const obj=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const string=(x:unknown,max:number,min=1):x is string=>typeof x==='string'&&x.trim().length>=min&&x.length<=max;
const strings=(x:unknown,max:number,len=180):x is string[]=>Array.isArray(x)&&x.length<=max&&x.every(v=>string(v,len));
const slug=(x:unknown):x is string=>typeof x==='string'&&/^[a-z0-9][a-z0-9-]{0,79}$/.test(x);
const keys=(x:Record<string,unknown>,allowed:string[])=>Object.keys(x).every(k=>allowed.includes(k));
export function parseEvalRecord(value:unknown):EvalRecord|null {
 try {
  if(!obj(value)||!keys(value,['schemaVersion','id','title','summary','kind','status','tags','versions','limitations','blocks','attachments'])||value.schemaVersion!==RECORD_VERSION||!evalUuid(value.id)||!string(value.title,120)||!string(value.summary,2000)||!['bugfix','feature','evaluation'].includes(String(value.kind))||!['verified','blocked','partial'].includes(String(value.status))||!strings(value.tags,12,80)||!strings(value.versions,20,80)||!strings(value.limitations,12,1200)||!Array.isArray(value.blocks)||!value.blocks.length||value.blocks.length>40||!Array.isArray(value.attachments)||value.attachments.length>3)return null;
  const blockIds=new Set<string>();
  for(const b of value.blocks){
   if(!obj(b)||!keys(b,['id','title','kind','summary','traceIds','changeIds','sections'])||!slug(b.id)||blockIds.has(b.id)||!string(b.title,120)||!string(b.summary,3000)||!['input_output','quality','repair','result','release'].includes(String(b.kind))||!Array.isArray(b.traceIds)||b.traceIds.length>12||!b.traceIds.every(evalUuid)||!strings(b.changeIds,40)||!Array.isArray(b.sections)||!b.sections.length||b.sections.length>20)return null;
   blockIds.add(b.id);const ids=new Set<string>();
   for(const s of b.sections){
    if(!obj(s)||!keys(s,['id','label','availability','source','format','content'])||!slug(s.id)||ids.has(s.id)||!string(s.label,160)||!string(s.source,1000)||!['retained','excerpt','fixture','metadata','missing'].includes(String(s.availability))||!['text','json'].includes(String(s.format))||(s.availability==='missing'?s.content!==null:!string(s.content,80000)))return null;
    if(s.format==='json'&&s.content!==null)JSON.parse(String(s.content));ids.add(s.id);
   }
  }
  const files:EvalRecord['attachments']=[],fileIds=new Set<string>();
  for(const file of value.attachments){
   if(!obj(file)||!keys(file,['id','name','base64','sha256','bytes'])||!slug(file.id)||fileIds.has(file.id)||!string(file.name,120)||!file.name.endsWith('.pdf')||/[\r\n/\\]/.test(file.name)||!string(file.base64,400000))return null;
   const bytes=Buffer.from(file.base64,'base64');
   if(bytes.toString('base64')!==file.base64||bytes.length>280000||!bytes.subarray(0,5).equals(Buffer.from('%PDF-')))return null;
   files.push({id:file.id,name:file.name,base64:file.base64,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});fileIds.add(file.id);
  }
  return redactEval({...value,attachments:files}) as EvalRecord;
 }catch{return null;}
}
export function recordIndex(record:EvalRecord):RecordIndex {
 return {summary:record.summary,kind:record.kind,status:record.status,tags:record.tags,versions:record.versions,
 traceIds:[...new Set(record.blocks.flatMap(b=>b.traceIds))],changeIds:[...new Set(record.blocks.flatMap(b=>b.changeIds))],blockTitles:record.blocks.map(b=>b.title)};
}
export const recordHash=(record:EvalRecord)=>createHash('sha256').update(JSON.stringify(record)).digest('hex');
export const recordView=(record:EvalRecord)=>({...record,attachments:record.attachments.map(({base64,...meta})=>{void base64;return meta;})});
