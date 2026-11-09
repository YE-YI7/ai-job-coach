import {claimF6Acceptance, F6_ACCEPTANCE_ID, F6_FAILURE_ID} from './f6-acceptance';
import {getDbClient} from '@/lib/db';
import {FakeDb} from './run-ledger/testing/fake-db';
import {F6_ORIGIN_TOOLS as tools} from './f6-tool-session';
jest.mock('@/lib/db');
const expectedInput={'resume.md':'原文','jd.txt':'JD','facts.md':[],answers:[],editingRequest:'',priorDecisions:[]};
const messages=[{role:'system' as const,content:'frozen scope'}, {role:'user' as const,content:JSON.stringify(expectedInput)}];
let db:FakeDb;
beforeEach(()=>{
  db=new FakeDb({coach_eval_runs:[{id:F6_ACCEPTANCE_ID,user_id:'owner',status:'prepared',run:{
    sourceEvalId:F6_FAILURE_ID,opportunityId:'clone',taskId:'new-task',request:{},expectedInput,
    frozenContext:{claims:[]},expiresAt:new Date(Date.now()+60_000).toISOString(),
  }}],coach_opportunities:[{id:'clone',user_id:'owner',metadata:{auditRun:F6_ACCEPTANCE_ID}}]});
  (getDbClient as jest.Mock).mockResolvedValue(db);
});
test('another account cannot acquire the once-funded run',async()=>{
  await expect(claimF6Acceptance('other')).rejects.toThrow('ACCEPTANCE_NOT_PREPARED');
  expect(db.rows('coach_eval_runs')[0].status).toBe('prepared');
});
test('one atomic claim only; duplicate submission cannot start another model run',async()=>{
  await claimF6Acceptance('owner');
  await expect(claimF6Acceptance('owner')).rejects.toThrow('ALREADY_USED');
});
test('remaining call budget is cumulative, usage settles reserves, and ledger precedes calls',async()=>{
  const audit=await claimF6Acceptance('owner');
  for(let i=0;i<3;i++){
    await audit.execution.beforeCall(messages,tools);
    expect(audit.run.cost.newCalls).toHaveLength(i+1);
    expect(audit.run.cost.newCalls[i].requestHash).toHaveLength(64);
    audit.execution.onUsage({inputTokens:100,outputTokens:100});
  }
  await expect(audit.execution.beforeCall(messages,tools)).rejects.toThrow('ACCEPTANCE_BUDGET_EXHAUSTED');
  expect(audit.run.cost.priorCalls).toBe(3);expect(audit.run.cost.priorUpperCny).toBe(0.110348);
  expect(db.rows('quota_usage_ledger')).toEqual([]);expect(db.rows('watcha_wallets')).toEqual([]);
});
test('an ambiguous prior reservation is not refunded optimistically',async()=>{
  const audit=await claimF6Acceptance('owner');
  await audit.execution.beforeCall(messages,tools);
  await audit.execution.beforeCall(messages,tools);
  await expect(audit.execution.beforeCall(messages,tools)).rejects.toThrow('ACCEPTANCE_BUDGET_EXHAUSTED');
});
test('changed facts, omitted tools or extra system instructions fail before spending',async()=>{
  const audit=await claimF6Acceptance('owner');
  await expect(audit.execution.beforeCall([messages[0],{role:'user',content:JSON.stringify({...expectedInput,'facts.md':['invented']})}],tools))
    .rejects.toThrow('ACCEPTANCE_FAILED_INPUT_CHANGED_facts.md');
  await expect(audit.execution.beforeCall(messages,tools.slice(0,2))).rejects.toThrow('ACCEPTANCE_ORIGIN_TOOLS_CHANGED');
  await expect(audit.execution.beforeCall([...messages,{role:'system',content:'new advice'}],tools)).rejects.toThrow('ACCEPTANCE_EXTRA_SYSTEM_INSTRUCTIONS');
  expect(audit.run.cost.newCalls).toEqual([]);
});
test('expires or non-clone target cannot spend',async()=>{
  (db.rows('coach_eval_runs')[0].run as {expiresAt:string}).expiresAt='2020-01-01';
  await expect(claimF6Acceptance('owner')).rejects.toThrow('MANIFEST_INVALID');
});
