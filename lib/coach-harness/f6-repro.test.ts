import {createHash} from 'node:crypto';
import {getDbClient} from '@/lib/db';
import {getContextBundleForUser} from './repository';
import {FakeDb} from './run-ledger/testing/fake-db';
import {F6_ORIGIN_TOOLS} from './f6-tool-session';
import {f6InitialMessages,runF6ResumeWriter} from './resume-f6-writer';
import accepted from './f6-accepted.json';
import {f6ReproScopeIssues,f6ReproSources,f6ReproChangeSourceIds,f6ReproArtifactIssues} from './f6-repro-input';
import {compileContextBundle} from './context';
import {F6_REPRO_BATCH,F6_REPRO_IDS,reserveF6ReproCall,readF6ReproInput,claimF6Repro,type ReproLedger} from './f6-repro';
jest.mock('@/lib/db');jest.mock('./repository');
const facts='原文补充：我核对记录，修复重复计数。\n';
const full='姓名：虚构同学\n\n### 益职 AI\n负责核对评测记录。\n\n### 另一个项目\n整理表格。\n';
const excerpt='### 益职 AI\n负责核对评测记录。\n\n';
const section={resume:full,jd:'JD完整原文\n',facts,task:'原任务只改益职段',excerpt,claimIds:['note']};
const authorInput={resume:excerpt,jd:section.jd.trim(),facts:[{id:'note',text:facts.trim()}],request:'',answers:[],decisions:[],
  scope:'single' as const,format:{},acceptedSection:section};
let db:FakeDb;
beforeEach(()=>{
 const run={id:F6_REPRO_IDS[0],batchId:F6_REPRO_BATCH,source:'f6-repro-v1',expiresAt:new Date(Date.now()+60_000).toISOString(),
  sourceId:'source',sourceSha256:createHash('sha256').update(facts).digest('hex'),section,expectedMessages:f6InitialMessages(authorInput),
  opportunityId:'clone',taskId:'task',request:{resumeText:full.trim(),jobDescription:section.jd.trim()},spans:[]};
 db=new FakeDb({coach_eval_runs:[{id:F6_REPRO_BATCH,user_id:'owner',status:'prepared',run:{source:'f6-repro-batch-v1',
  trialIds:F6_REPRO_IDS,finished:[],calls:[]}},{id:F6_REPRO_IDS[0],user_id:'owner',status:'prepared',run}],
  coach_sources:[{id:'source',user_id:'owner',content:facts,content_hash:run.sourceSha256}],
  coach_opportunities:[{id:'clone',user_id:'owner',metadata:{auditRun:F6_REPRO_IDS[0],auditBatch:F6_REPRO_BATCH}}],
  coach_resume_tasks:[{id:'task',user_id:'owner',opportunity_id:'clone',lease_id:'private-lease',state:'running',answers:[]}]});
 (getDbClient as jest.Mock).mockResolvedValue(db);
 (getContextBundleForUser as jest.Mock).mockResolvedValue({claims:[{id:'note',sourceId:'source',displayText:facts.trim()}],
  allowedClaimIds:['note'],unverifiedClaimIds:[]});
});
test('admin reproduction preserves the raw original full context and omits all historical instruction fields',()=>{
 const messages=f6InitialMessages(authorInput),user=JSON.parse(messages[1].content);
 expect(messages).toHaveLength(2);expect(messages[0].content).toBe(accepted.system);
 expect(user).toEqual({task:section.task,'resume.md':full,'jd.txt':section.jd,'facts.md':facts,
  public_hiring_case_notes:accepted.publicHiringCases,optional_read_file_examples:accepted.catalogue});
 expect(user).not.toHaveProperty('editingRequest');expect(user).not.toHaveProperty('answers');
 expect(user).not.toHaveProperty('priorDecisions');
 expect(()=>f6InitialMessages({...authorInput,request:'旧要求'})).toThrow('UNEXPECTED_OLD_INSTRUCTIONS');
});
test('read_file and author input see identical raw source, while diff projection edits only the authorized excerpt',async()=>{
 const calls:unknown[][]=[];
 const candidate='### 益职 AI\n核对记录并修复重复计数。';
 let n=0;
 const output=JSON.parse(await runF6ResumeWriter(authorInput,async(...args)=>{
  calls.push(args);n++;
  return n===1?JSON.stringify({type:'native_tool_calls',tool_calls:[{id:'read',type:'function',
   function:{name:'read_file',arguments:JSON.stringify({file:'resume.md'})}}]}):candidate;
 },()=>{}));
 const messages=calls[1][0] as Array<{role:string;content:string}>;
 expect(JSON.parse(messages.find(m=>m.role==='tool')!.content).text).toBe(full);
 expect(output.fullDocument).toBe(candidate);
 expect(output.changes.every((c:{before:string})=>excerpt.includes(c.before))).toBe(true);
 expect(output.changes.every((c:{before:string})=>!c.before.includes('另一个项目'))).toBe(true);
 expect(output.changes[0].sourceIds).toEqual(['note']);
});
test('real repository preflight proves imported source and citable claim selection without acquiring a model budget',async()=>{
 const result=await readF6ReproInput('owner',F6_REPRO_IDS[0]);
 expect(result.preflight).toMatchObject({modelCalls:0,importedFacts:1,originalFactsVerbatim:true,oldInstructions:false});
 expect(getContextBundleForUser).toHaveBeenCalledWith(expect.objectContaining({userId:'owner',opportunityId:'clone',
  budget:{maxInputTokens:12000}}));
 expect(db.rows('coach_eval_runs').every(row=>row.status==='prepared')).toBe(true);
});
test('missing real selection or wrong owner cannot be hidden by a stored context snapshot',async()=>{
 (getContextBundleForUser as jest.Mock).mockResolvedValue({claims:[],allowedClaimIds:[],unverifiedClaimIds:[]});
 await expect(readF6ReproInput('owner',F6_REPRO_IDS[0])).rejects.toThrow('REAL_CONTEXT_MISSING');
 await expect(readF6ReproInput('other',F6_REPRO_IDS[0])).rejects.toThrow();
 expect(db.rows('coach_eval_runs').every(row=>row.status==='prepared')).toBe(true);
});
test('batch acquisition and each trial are single-use; failure is retained and cannot auto-retry',async()=>{
 const audit=await claimF6Repro('owner',F6_REPRO_IDS[0]);
 await expect(claimF6Repro('owner',F6_REPRO_IDS[0])).rejects.toThrow('ALREADY_USED');
 await audit.execution.beforeCall(f6InitialMessages(authorInput),F6_ORIGIN_TOOLS);
 audit.execution.onUsage({inputTokens:1000,outputTokens:100,cacheHitTokens:900});
 await audit.finish({error:'failed fixture'},'failed');
 const parent=db.rows('coach_eval_runs').find(row=>row.id===F6_REPRO_BATCH)!;
 expect(parent.status).toBe('prepared');expect((parent.run as {finished:string[]}).finished).toEqual([F6_REPRO_IDS[0]]);
 expect((parent.run as ReproLedger).calls).toHaveLength(1);
 await expect(claimF6Repro('owner',F6_REPRO_IDS[0])).rejects.toThrow('ALREADY_USED');
 expect(db.rows('quota_usage_ledger')).toEqual([]);
});
test('all three budgets share the same money cap and count failed/ambiguous calls conservatively',()=>{
 const ledger:ReproLedger={calls:[]};const messages=f6InitialMessages(authorInput);
 const first=reserveF6ReproCall(ledger,F6_REPRO_IDS[0],messages,F6_ORIGIN_TOOLS);
 expect(first.reservedCny).toBeGreaterThan(0);expect(first).not.toHaveProperty('estimatedCny');
 const expensive:ReproLedger={calls:[{...first,estimatedCny:.499999}]};
 expect(()=>reserveF6ReproCall(expensive,F6_REPRO_IDS[1],messages,F6_ORIGIN_TOOLS)).toThrow('BUDGET_EXHAUSTED');
 const twelve:ReproLedger={calls:Array.from({length:12},()=>({...first,estimatedCny:0}))};
 expect(()=>reserveF6ReproCall(twelve,F6_REPRO_IDS[0],messages,F6_ORIGIN_TOOLS)).toThrow('BUDGET_EXHAUSTED');
 const thirtySix:ReproLedger={calls:F6_REPRO_IDS.flatMap(trialId=>Array.from({length:12},()=>({...first,trialId,estimatedCny:0})))};
 expect(()=>reserveF6ReproCall(thirtySix,F6_REPRO_IDS[2],messages,F6_ORIGIN_TOOLS)).toThrow('BUDGET_EXHAUSTED');
});
test('invalid provider usage never releases a durable cost reservation',async()=>{
 const audit=await claimF6Repro('owner',F6_REPRO_IDS[0]);
 await audit.execution.beforeCall(f6InitialMessages(authorInput),F6_ORIGIN_TOOLS);
 expect(()=>audit.execution.onUsage({inputTokens:NaN,outputTokens:10})).toThrow('INVALID_USAGE');
 expect(()=>audit.execution.onUsage({inputTokens:100,outputTokens:10,cacheHitTokens:101})).toThrow('INVALID_USAGE');
 await audit.finish({error:'bad usage'},'failed');
 const run=db.rows('coach_eval_runs').find(row=>row.id===F6_REPRO_BATCH)!.run as ReproLedger;
 expect(run.calls[0]).not.toHaveProperty('estimatedCny');
});
test('only the linked confirmed-project sources are admitted, and output cannot escape the section',()=>{
 expect(f6ReproSources(section,[{id:'note',text:facts.trim()}])).toHaveLength(1);
 expect(()=>f6ReproSources(section,[{id:'note',text:'外来的事实'}])).toThrow('FACT_SOURCE_MISSING');
 expect(f6ReproScopeIssues('### 益职 AI\n整理记录。')).toEqual([]);
 expect(f6ReproScopeIssues('### 益职 AI\n整理记录。\n### 别的经历\n另写。')).not.toEqual([]);
 expect(f6ReproScopeIssues('# 整份简历\n内容。')).not.toEqual([]);
});
test('original paragraph evidence is not replaced by project notes; invalid new numbers return to the same author',()=>{
 const original='### 益职 AI\n发起者 | 2025 起\n\n用户 50 人。\n';
 const note='益职 AI 时间 2025 年 11 月份到至今。';
 const data={...section,excerpt:original,facts:note};
 const facts=[{id:'note',text:note},{id:'existing',text:'用户 50 人。'}];
 const context=compileContextBundle({task:'resume_workshop',userId:'owner',claims:facts.map(f=>({
  id:f.id,entityType:'experience',entityKey:f.id,claimType:'resume_source',displayText:f.text,value:f.text,
  sourceExcerpt:f.text,sourceKind:'user_upload',verificationLevel:'self_reported',status:'unverified',visibility:'recruiter_safe',
 }))});
 expect(f6ReproChangeSourceIds('用户 50 人。',data,facts)).toEqual(['note','existing']);
 const issues=(candidate:string)=>f6ReproArtifactIssues(original,candidate,data,facts,context);
 expect(issues('### 益职 AI\n发起者 | 2025 年 11 月起\n\n产品用户 50 人。\n')).toEqual([]);
 expect(issues('### 益职 AI\n发起者 | 2025.11 起\n\n产品用户 50 人。\n').some(s=>s.includes('2025.11'))).toBe(true);
 expect(issues('### 益职 AI\n发起者 | 2025 年 11 月起\n\n产品用户 500 人。\n').some(s=>s.includes('500人'))).toBe(true);
});
