import {generateLandingPreview,landingFallback} from './landing-mentor';
import {callLLM} from './llm';
jest.mock('./llm',()=>({callLLM:jest.fn()}));
const model=callLLM as jest.Mock;
test('uses one bounded site-funded call without an account credential or retry',async()=>{
  model.mockResolvedValue(JSON.stringify({understanding:'会计应届生想转运营，缺少相关实习',nextStep:'先圈出一个运营JD的三条核心职责'}));
  const result=await generateLandingPreview('虚构测试','qa-preview');
  expect(result.source).toBe('model');
  expect(model).toHaveBeenCalledWith(expect.any(Array),expect.objectContaining({siteFunded:true,maxRetries:0,
    maxTokens:350,timeoutMs:20000,thinking:'disabled'}));
});
test('malformed, overlong and markdown output is not delivered as a valid model response',async()=>{
  for(const raw of ['broken',JSON.stringify({understanding:'**泛化建议**',nextStep:'修改简历'}),
    JSON.stringify({understanding:'长'.repeat(181),nextStep:'下一步'})]){
    model.mockResolvedValue(raw);await expect(generateLandingPreview('虚构输入','qa-preview')).rejects.toThrow();
  }
  expect(landingFallback('原始困惑').understanding).toContain('原始困惑');
});
