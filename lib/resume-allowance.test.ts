import {loadResumeStartAdvice,resumeStartAdvice} from './resume-allowance';

const reply=(body:unknown,status=200)=>Promise.resolve(Response.json(body,{status}));
const quota=(source:string,allowed=true,remaining:number|null=1)=>({
  ok:true,checks:{resume:{source,allowed,remaining}},resumeTrial:{available:true},
});

test('site quota and points are one reservation per successful rewrite, not per internal model call',()=>{
  expect(resumeStartAdvice({source:'paid',allowed:true,remaining:3})).toMatchObject({allowed:true,fee:'本次 1 次简历额度 · 当前余 3'});
  expect(resumeStartAdvice({source:'watcha',allowed:true,remaining:2})).toMatchObject({allowed:true,fee:'本次 1 积分 · 当前余 2'});
  expect(resumeStartAdvice({source:'watcha',allowed:true,remaining:2}).note).toContain('不重复扣积分');
});
test('a free experience trial never authorizes a complete rewrite',()=>{
  const advice=resumeStartAdvice({source:'free',allowed:false,remaining:0},true);
  expect(advice.allowed).toBe(false);
  expect(advice.note).toContain('免费体验修改一段经历');
});
test('preflight is a no-store GET and neither reserves quota nor starts a model request',async()=>{
  const fetcher=jest.fn(()=>reply(quota('paid'))) as unknown as typeof fetch;
  expect((await loadResumeStartAdvice(fetcher)).allowed).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher).toHaveBeenCalledWith('/api/quota/check',expect.objectContaining({cache:'no-store'}));
  expect((fetcher as jest.Mock).mock.calls[0][1].method).toBeUndefined();
});
test.each([reply({ok:false},401),reply({ok:true,checks:{resume:{source:'unknown',allowed:true}}}),reply({ok:true})])(
  'unavailable or malformed quota never silently authorizes a start',async response=>{
    await expect(loadResumeStartAdvice(jest.fn(()=>response) as unknown as typeof fetch)).rejects.toThrow('暂时无法确认额度');
  },
);
test.each([0,-1])('a confirmed nonpositive TokenPay balance is blocked before generation: %s',async available=>{
  const fetcher=jest.fn().mockImplementationOnce(()=>reply(quota('tokenpay',true,null)))
    .mockImplementationOnce(()=>reply({ok:true,account:{connected:true,status:'active',balance:{unit:'CNY',available}}}));
  expect(await loadResumeStartAdvice(fetcher)).toMatchObject({allowed:false,fee:'TokenPay 余额不足'});
  expect(fetcher).toHaveBeenCalledTimes(2);
});
test('TokenPay has no fabricated flat price and an unknown balance is not invented as zero',async()=>{
  const fetcher=jest.fn().mockImplementationOnce(()=>reply(quota('tokenpay',true,null)))
    .mockRejectedValueOnce(Error('offline'));
  const advice=await loadResumeStartAdvice(fetcher);
  expect(advice.allowed).toBe(true);
  expect(advice.fee).toContain('实际模型用量');
  expect(advice.note).toContain('暂未读到');
  expect(advice.note).not.toContain('余额不足');
});
test('TokenPay expiry and known balance are displayed separately from site credits',async()=>{
  const expired=jest.fn().mockImplementationOnce(()=>reply(quota('tokenpay',true,null)))
    .mockImplementationOnce(()=>reply({ok:true,account:{connected:true,status:'reauthorize',balance:null}}));
  expect((await loadResumeStartAdvice(expired)).allowed).toBe(false);
  const active=jest.fn().mockImplementationOnce(()=>reply(quota('tokenpay',true,null)))
    .mockImplementationOnce(()=>reply({ok:true,account:{balance:{unit:'CNY',available:1.25}}}));
  expect((await loadResumeStartAdvice(active)).fee).toContain('余额 ¥1.25');
});
test.each(['top_up_balance','api_key_quota','reauthorize_api_key'])('known TokenPay recovery is shown before a start: %s',async recoveryAction=>{
  const fetcher=jest.fn().mockImplementationOnce(()=>reply(quota('tokenpay',true,null)))
    .mockImplementationOnce(()=>reply({ok:false,recoveryAction},402));
  expect((await loadResumeStartAdvice(fetcher)).allowed).toBe(false);
});
test('a disconnected connection cannot retain the old TokenPay fee promise',async()=>{
  const fetcher=jest.fn().mockImplementationOnce(()=>reply(quota('tokenpay',true,null)))
    .mockImplementationOnce(()=>reply({ok:true,account:{connected:false}}));
  expect(await loadResumeStartAdvice(fetcher)).toMatchObject({allowed:false,fee:'计费连接已变化'});
});
