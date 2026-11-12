import {getDbClient} from '@/lib/db';
import {workspaceQaBudget,workspaceQaTarget} from './workspace-qa-budget';
import type {EvalSpan} from './eval-scope';
jest.mock('@/lib/db',()=>({getDbClient:jest.fn()}));
const original={...process.env};
type StoredBudget={callVersion:number;calls:Array<{id:string;reservedCny:number;settledUpperCny?:number}>;
  evalRunId?:string;[key:string]:unknown};
type Patch={run:StoredBudget};
const span=():EvalSpan=>({id:'call',name:'author',kind:'agent',status:'running',startedAt:'',durationMs:0,
  input:{messages:[{role:'user',content:'原始虚构简历，未追加点评'}],options:{maxTokens:7500}},output:null,knowledge:[]});
function database(overrides:Record<string,unknown>={}) {
  let run:StoredBudget={source:'clean-first-use-budget-v1',approved:true,synthetic:true,opportunityId:'op',
    authorizationId:'explicit-owner-approval',expiresAt:new Date(Date.now()+3600000).toISOString(),
    capCny:0.50,capCalls:27,callVersion:0,calls:[],...overrides};
  const writes:Patch[]=[];
  (getDbClient as jest.Mock).mockResolvedValue({from:(table:string)=>{
    expect(table).toBe('coach_eval_runs');
    let patch:Patch|undefined;const filters:Record<string,string>={};
    type Chain={eq:(key:string,value:string)=>Chain;update:(value:Patch)=>Chain;
      single:()=>Promise<{data:{run:StoredBudget};error:null}>;
      select:()=>Chain|Promise<{data:Array<{id:string}>;error:null}>};
    const chain:Chain={eq:(key:string,value:string)=>{filters[key]=value;return chain;},
      update:(value:Patch)=>{patch=value;return chain;},
      single:async()=>({data:{run:structuredClone(run)},error:null}),
      select:()=>{
        if(!patch)return chain;
        expect(filters.id).toBe('budget');expect(filters.user_id).toBe('qa');
        if(filters['run->>callVersion']!==String(run.callVersion))return Promise.resolve({data:[],error:null});
        writes.push(structuredClone(patch));run=structuredClone(patch.run);
        return Promise.resolve({data:[{id:'budget'}],error:null});
      }};
    return chain;
  }});
  return {read:()=>structuredClone(run),writes};
}
beforeEach(()=>{
  jest.clearAllMocks();process.env.F6_QA_USER_ID='qa';process.env.F6_QA_BUDGET_ID='budget';
  process.env.HOSTED_LLM_PROVIDER='stepfun';process.env.HOSTED_LLM_MODEL='step-3.7-flash';
});
afterAll(()=>{for(const key of ['F6_QA_USER_ID','F6_QA_BUDGET_ID','HOSTED_LLM_PROVIDER','HOSTED_LLM_MODEL']) {
  if(original[key]===undefined)delete process.env[key];else process.env[key]=original[key];
}});
test('ordinary users never enter the QA store or acquire capture consent',async()=>{
  expect(workspaceQaTarget('normal')).toBe(false);
  expect(await workspaceQaBudget('normal','op','eval')).toBeUndefined();
  expect(getDbClient).not.toHaveBeenCalled();
});
test('claims only the explicitly authorized account and opportunity, without touching inputs',async()=>{
  const store=database(),call=span(),input=structuredClone(call.input);
  const guard=(await workspaceQaBudget('qa','op','eval'))!;
  await guard.beforeModel(call);
  expect(call.input).toEqual(input);expect(store.read().evalRunId).toBe('eval');
  expect(store.read().calls).toHaveLength(1);expect(store.read().calls[0].reservedCny).toBeGreaterThan(0);
  call.status='completed';call.model='step-3.7-flash';
  call.usage={inputTokens:1000,outputTokens:100,cacheHitTokens:0,estimatedCostUsd:null,pricingVersion:null,provider:'stepfun',retryCount:0};
  await guard.afterModel(call);
  expect(store.read().calls[0].settledUpperCny).toBeCloseTo(0.0024);
  expect(call.input).toEqual(input);
});
test.each([{opportunityId:'foreign'},{approved:false},{closedAt:'closed'},
  {expiresAt:'invalid'},{capCny:20},{capCalls:100}])('invalid authorization refuses without writing: %p',async(change)=>{
  const store=database(change);
  await expect(workspaceQaBudget('qa','op','eval')).rejects.toThrow('QA_BUDGET_INVALID');
  expect(store.writes).toHaveLength(0);
});
test('cost or call exhaustion refuses before adding a request, without a retry',async()=>{
  const store=database({calls:[{id:'old',reservedCny:.49}]}),guard=(await workspaceQaBudget('qa','op','eval'))!;
  await expect(guard.beforeModel(span())).rejects.toThrow('QA_BUDGET_EXHAUSTED');
  await guard.afterModel(span());expect(store.read().calls).toHaveLength(1);
});
test('missing usage or failed calls retain the complete reservation',async()=>{
  const store=database(),guard=(await workspaceQaBudget('qa','op','eval'))!,call=span();
  await guard.beforeModel(call);call.status='failed';await guard.afterModel(call);
  expect(store.read().calls[0].settledUpperCny).toBeUndefined();
});
test('the budget cannot fund a second generation, even with available funds',async()=>{
  database();await workspaceQaBudget('qa','op','eval');
  await expect(workspaceQaBudget('qa','op','another')).rejects.toThrow('QA_BUDGET_INVALID');
  await expect(workspaceQaBudget('qa','op','eval')).rejects.toThrow('QA_GENERATION_ALREADY_CLAIMED');
});
test('a changed provider model cannot silently spend the approved small-model cap',async()=>{
  database();const guard=(await workspaceQaBudget('qa','op','eval'))!;
  process.env.HOSTED_LLM_MODEL='other';
  await expect(guard.beforeModel(span())).rejects.toThrow('QA_HOSTED_MODEL_CHANGED');
});
