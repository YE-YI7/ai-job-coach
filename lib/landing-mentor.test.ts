import {generateLandingPreview,landingFallback,parseLandingPreview} from './landing-mentor';
import {LANDING_PREVIEW_POLICY} from './landing-handoff';
import {callLLM} from './llm';
import historical from './fixtures/landing-preview-20261024.json';
jest.mock('./llm',()=>({callLLM:jest.fn()}));
const model=callLLM as jest.Mock;
const encode=(understanding:string,nextStep:string)=>JSON.stringify({understanding,nextStep});
beforeEach(()=>jest.clearAllMocks());

test('uses one bounded site-funded call, no retry and no false thinking-disable claim',async()=>{
  model.mockResolvedValue(encode('你想从财务实习转做运营。','选一段实习，标出与运营相关的一件事。'));
  const result=await generateLandingPreview('会计应届生想转运营','qa-preview');
  expect(result).toMatchObject({source:'model',policyVersion:LANDING_PREVIEW_POLICY});
  const options=model.mock.calls[0][1];
  expect(options).toMatchObject({siteFunded:true,maxRetries:0,maxTokens:350,
    reasoningBudgetTokens:512,timeoutMs:20000});
  expect(options).not.toHaveProperty('thinking');
  expect(model.mock.calls[0][0][0].content).toContain('行动和追问二选一');
  expect(model.mock.calls[0][0][0].content).toContain('不根据留学');
});

test.each(historical.cases)('rejects captured v1 API response without rerunning its model: $requestId',entry=>{
  expect(()=>parseLandingPreview(encode(entry.understanding,entry.nextStep),entry.input)).toThrow();
  expect(model).not.toHaveBeenCalled();
});

test.each([
  ['用户有两年运营经验。','回忆最近一次二面的一个难题。'],
  ['你做运营，求职者希望换工作。','选一个想投的岗位。'],
  ['你已回国三个月。','筛选应届生或校招岗位。'],
  ['你已回国三个月。','选择校招。'],
  ['你是硕士应届生。','选一个想投的岗位。'],
  ['你想改简历。','重写一个bullet point。'],
  ['你想改简历。','先看JD，再重写经历。'],
  ['你想练面试。','整理三个问题并写出回答框架。'],
  ['你想练面试。','你在哪个城市？什么时候毕业？'],
  ['你想练面试。','你在哪个城市、还有什么时候毕业？'],
  ['你想改简历。','字'.repeat(61)],
  ['你想改简历。','看一个JD。写一段经历。'],
])('specific contract gate rejects %s / %s', (summary,step)=>{
  expect(()=>parseLandingPreview(encode(summary,step),'虚构输入，想改简历或找工作')).toThrow();
});

test.each([
  ['你已回国三个月，想确认现在从哪开始投。','你是哪年哪月毕业的？'],
  ['你想做用户增长，但还没定方向。','选一件你做过的用户增长小事。'],
  ['你想看一个校招岗位。','核对这个校招岗位的毕业时间要求。'],
  ['你想转AI产品。','选一个AI产品JD，读它的核心职责。'],
])('one factual question or action is accepted, including business word 用户', (summary,step)=>{
  expect(parseLandingPreview(encode(summary,step),'虚构输入，校招岗位与AI产品')).toMatchObject({
    source:'model',understanding:summary,nextStep:step,policyVersion:LANDING_PREVIEW_POLICY});
});

test('malformed, extra-key and markdown outputs are rejected; fallback keeps the original',async()=>{
  for(const raw of ['broken','null','[]',encode('**你想改简历**','选一段经历。'),
    JSON.stringify({understanding:'你想改简历。',nextStep:'选一段经历。',extra:'injected'})]){
    model.mockResolvedValue(raw);
    await expect(generateLandingPreview('虚构输入','qa-preview')).rejects.toThrow();
  }
  expect(landingFallback('原始困惑')).toEqual({source:'fallback',understanding:'你刚才说：「原始困惑」',
    nextStep:'我先记下了。登录后，我们就从这句话接着聊。'});
});
