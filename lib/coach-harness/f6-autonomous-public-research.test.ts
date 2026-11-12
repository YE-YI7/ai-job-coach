import {F6ToolSession} from './f6-tool-session';
import {F6PublicTools} from './f6-public-tools';
import {F6PublicResearchPrivacy} from './f6-public-research-privacy';
import {runF6ResumeWriter} from './resume-f6-writer';
import {F6HrReviewSession} from './f6-hr-review';

const resume='姓名：林禾\n邮箱：lin@example.test\n手机：13800138000\n\n负责整理问答失败原因，核对人工验收记录。';
const secret='我与某内部团队在未发布的客户项目中调整了保密验收规则并记录了具体的失败分类及实施过程，'
  +'另外整理了客户尚未公开的内部审批过程和各次验收中的问题以及人工复核记录，这些材料没有公开发布也没有获准作为公共搜索内容。';
const input={resume,jd:'',facts:[{id:'private',text:secret}],company:'',request:'',answers:[],decisions:[],
  scope:'whole' as const,format:{},mentorCoaching:true as const};
const hooks=()=>({search:jest.fn().mockResolvedValue({results:[]}),fetch:jest.fn().mockResolvedValue({pages:[]}),
  render:jest.fn().mockResolvedValue({bytes:new Uint8Array([1]),receipt:{pages:1}})});
const session=()=>{const services=hooks();return {services,active:new F6ToolSession(input,()=>[],services,undefined,undefined,true)};};
const call=(name:string,args:unknown)=>JSON.stringify({type:'native_tool_calls',tool_calls:[{
  id:'call-'+name,type:'function',function:{name,arguments:JSON.stringify(args)},
}]});

test.each(['供应链产品经理 怎样证明交付取舍','how to validate a failed product experiment',
  'API key 安全设计 招聘工程能力证据'])('author chooses the query without a company or topic menu: %s',async query=>{
  const {services,active}=session();
  await active.invoke('search',{query});
  expect(services.search).toHaveBeenCalledWith(query);
  expect(services.search.mock.calls[0]).toHaveLength(1);
});

test('a public user source and a newly discovered link can be fetched before any search',async()=>{
  const {services,active}=session();
  const urls=['https://careers.example.com/product','https://blog.example.com/interview#evidence'];
  await active.invoke('fetch',{urls});
  expect(services.fetch).toHaveBeenCalledWith([urls[0],'https://blog.example.com/interview']);
  expect(services.search).not.toHaveBeenCalled();
});

test('a public technical phrase occurring in the resume is not rejected just for sharing words',()=>{
  const phrase='Agent Harness Context Engineering Eval';
  const privacy=new F6PublicResearchPrivacy(['我在项目中使用 '+phrase+' 整理过问题。']);
  expect(privacy.query(phrase+' methodology examples')).toBe(phrase+' methodology examples');
});

test.each(['lin@example.test 评测','138 0013 8000 查询','林禾 的项目经历',secret,
  'api_key=private-value','sk-abcdefghijklmnopqrstuvwx'])('blocks private research locally, including injected tool services: %s',async query=>{
  const {services,active}=session();
  await expect(active.invoke('search',{query})).rejects.toThrow('PUBLIC_RESEARCH_PRIVATE_INPUT');
  expect(services.search).not.toHaveBeenCalled();
  expect(active.errorReceipt(Error('PUBLIC_RESEARCH_PRIVATE_INPUT'))).toMatchObject({sentToPublicService:false,
    instruction:expect.stringContaining('自行换成')});
});

test.each(['https://example.com/?q=lin%40example.test',
  'https://example.com/'+encodeURIComponent(encodeURIComponent(secret)),
  'https://127.0.0.1/data','https://[::ffff:127.0.0.1]/data','http://example.com/public',
  'https://example.internal/data','https://user:password@example.com/data'])('direct fetch still rejects unsafe/private URLs: %s',async url=>{
  const {services,active}=session();
  await expect(active.invoke('fetch',{urls:[url]})).rejects.toThrow();
  expect(services.fetch).not.toHaveBeenCalled();
});

test('unknown old topic gets a useful protocol receipt, not a silent fixed query',async()=>{
  const {services,active}=session();
  const error=await active.invoke('search',{topic:'role'}).catch(error=>active.errorReceipt(error));
  expect(error).toMatchObject({error:'PUBLIC_QUERY_REQUIRED',sentToPublicService:false,
    instruction:expect.stringContaining('不再选择topic')});
  expect(services.search).not.toHaveBeenCalled();
});

test('private input does not consume public budget or reach transport; legitimate arbitrary research still can',async()=>{
  const network=jest.fn().mockImplementation(async()=>new Response(JSON.stringify({result:{content:[{type:'text',
    text:'Title: Public methodology\nURL: https://example.com/method\nA public teaching source'}]}})));
  const research=new F6PublicTools('',network,new F6PublicResearchPrivacy([resume,secret]));
  await expect(research.search(secret)).rejects.toThrow('PUBLIC_RESEARCH_PRIVATE_INPUT');
  expect(research.budget()).toEqual({used:0,remaining:4,limit:4});
  for(let turn=0;turn<4;turn++)await research.search('公开评测方法 '+turn);
  await expect(research.search('另外一个公开问题')).rejects.toThrow('PUBLIC_REQUEST_BUDGET');
  expect(network).toHaveBeenCalledTimes(4);
});

test('same author can freely fetch, search, then write; HR remains once and no extra planning model is inserted',async()=>{
  const services=hooks(),author=jest.fn()
    .mockResolvedValueOnce(call('fetch',{urls:['https://example.com/public']}))
    .mockResolvedValueOnce(call('search',{query:'非互联网产品经理 真实交付验收证据'}))
    .mockResolvedValueOnce(call('write_output',{files:[{name:'resume-new.md',text:resume},
      {name:'mentor.md',text:'你核对验收记录时具体采用哪一项标准？'}]}))
    .mockResolvedValueOnce('HR建议未改变已有事实，保留正文和已提出的问题。');
  const review=jest.fn().mockResolvedValue('核对标准尚待本人补充，不补造指标。');
  const result=JSON.parse(await runF6ResumeWriter(input,author,()=>{},undefined,services,undefined,
    new F6HrReviewSession({resume,jd:'',facts:secret},review)));
  expect(services.fetch).toHaveBeenCalledWith(['https://example.com/public']);
  expect(services.search).toHaveBeenCalledWith('非互联网产品经理 真实交付验收证据');
  expect(author).toHaveBeenCalledTimes(4);expect(review).toHaveBeenCalledTimes(1);
  expect(result.fullDocument).toBe(resume);
  expect(result.f6Deliverables.mentorGuidance).toMatchObject({current:true,text:expect.stringContaining('哪一项标准')});
  for(const invocation of author.mock.calls){
    const tools=invocation[3];
    expect(tools.find((tool:{function:{name:string}})=>tool.function.name==='search').function.parameters.required).toEqual(['query']);
  }
});
