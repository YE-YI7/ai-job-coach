import {watchaOAuthJson, WatchaOAuthRequestError, WATCHA_OAUTH_TIMEOUT_MS} from './watcha-oauth-request';
import {exchangeCodeForToken, getWatchaUserInfo} from './watcha-oauth';

afterEach(()=>{jest.restoreAllMocks();jest.useRealTimers();});
beforeEach(()=>{
  jest.spyOn(console,'info').mockImplementation(()=>{});
  jest.spyOn(console,'warn').mockImplementation(()=>{});
});

test.each(['headers','body'])('eight-second deadline covers hung %s, aborts and never retries',async phase=>{
  jest.useFakeTimers();
  const body = new Promise(()=>{});
  const request = jest.spyOn(globalThis,'fetch').mockImplementation(()=>phase==='headers'
    ? new Promise(()=>{}) : Promise.resolve({ok:true,json:()=>body} as unknown as Response));
  const result = watchaOAuthJson('token','https://watcha.cn/oauth/api/token',{method:'POST',body:'code=synthetic'});
  const rejected = expect(result).rejects.toMatchObject({stage:'token',reason:'timeout'});
  await jest.advanceTimersByTimeAsync(WATCHA_OAUTH_TIMEOUT_MS);
  await rejected;
  expect(request).toHaveBeenCalledTimes(1);
  expect(request.mock.calls[0][1]?.signal?.aborted).toBe(true);
  expect(jest.getTimerCount()).toBe(0);
});

test('successful bounded request preserves body, refuses redirects and logs no credentials',async()=>{
  const request = jest.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({access_token:'synthetic-secret'})));
  const result = await watchaOAuthJson('token','https://watcha.cn/oauth/api/token',{
    method:'POST',body:'client_secret=synthetic-secret',
  });
  expect(result.access_token).toBe('synthetic-secret');
  expect(request.mock.calls[0][1]).toMatchObject({method:'POST',body:'client_secret=synthetic-secret',cache:'no-store',redirect:'error'});
  expect(JSON.stringify(jest.mocked(console.info).mock.calls)).not.toContain('synthetic-secret');
});

test.each([401,503])('HTTP %s is rejected before body parsing, without automatic retry',async status=>{
  const json = jest.fn();
  const request = jest.spyOn(globalThis,'fetch').mockResolvedValue({ok:false,status,json} as unknown as Response);
  await expect(watchaOAuthJson('userinfo','https://watcha.cn/oauth/api/userinfo',{}))
    .rejects.toMatchObject({reason:status===401?'rejected':'unavailable'});
  expect(json).not.toHaveBeenCalled();
  expect(request).toHaveBeenCalledTimes(1);
});

test('malformed upstream JSON never leaks the raw parse error',async()=>{
  jest.spyOn(globalThis,'fetch').mockResolvedValue({ok:true,json:async()=>{throw Error('synthetic-secret');}} as unknown as Response);
  const error = await watchaOAuthJson('token','https://watcha.cn/oauth/api/token',{}).catch(e=>e);
  expect(error).toBeInstanceOf(WatchaOAuthRequestError);
  expect(error.reason).toBe('invalid_response');
  expect(error.message).not.toContain('synthetic-secret');
});

test('network errors are classified without leaking request URLs or low-level messages',async()=>{
  jest.spyOn(globalThis,'fetch').mockRejectedValue(Error('https://watcha.cn/?access_token=synthetic-secret'));
  await expect(watchaOAuthJson('userinfo','https://watcha.cn/oauth/api/userinfo',{}))
    .rejects.toMatchObject({reason:'unavailable'});
  expect(JSON.stringify(jest.mocked(console.warn).mock.calls)).not.toContain('synthetic-secret');
});

test('HTTP-200 userinfo with no stable identity cannot proceed',async()=>{
  jest.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({statusCode:200,data:{nickname:'synthetic'}})));
  await expect(getWatchaUserInfo('synthetic-access')).rejects.toMatchObject({stage:'userinfo',reason:'invalid_response'});
});

test('OAuth rejection body cannot become a credential-bearing error message',async()=>{
  const beforeId=process.env.WATCHA_YIZHI_CLIENT_ID, beforeSecret=process.env.WATCHA_YIZHI_CLIENT_SECRET;
  process.env.WATCHA_YIZHI_CLIENT_ID='synthetic-id';process.env.WATCHA_YIZHI_CLIENT_SECRET='synthetic-secret';
  try {
    jest.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({error:'invalid_grant',error_description:'synthetic-secret'})));
    const error=await exchangeCodeForToken('synthetic-code','https://yizhioffer.com').catch(e=>e);
    expect(error).toMatchObject({stage:'token',reason:'rejected'});
    expect(error.message).not.toContain('synthetic-secret');
  } finally {
    if(beforeId===undefined)delete process.env.WATCHA_YIZHI_CLIENT_ID;else process.env.WATCHA_YIZHI_CLIENT_ID=beforeId;
    if(beforeSecret===undefined)delete process.env.WATCHA_YIZHI_CLIENT_SECRET;else process.env.WATCHA_YIZHI_CLIENT_SECRET=beforeSecret;
  }
});
