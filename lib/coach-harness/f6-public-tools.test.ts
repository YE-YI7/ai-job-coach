import {F6PublicTools, f6PublicUrl} from './f6-public-tools';
import {f6OriginResearch} from './f6-origin-research';
const result = (text: string) => new Response(JSON.stringify({jsonrpc:'2.0', result:{content:[{type:'text',text}]}}));
test('author-written query is sent unchanged; direct public reading shares the same four-request budget', async () => {
  const network = jest.fn().mockResolvedValueOnce(result('Title: Manus research\nURL: https://manus.im/docs\nPublished Date: 2026-11-01\nAuthor: Manus\npublic summary'))
    .mockImplementation(async(_url, request)=>result(JSON.parse(request.body).params.arguments.urls
      .map((url:string)=>'URL: '+url+'\nFetched public page content').join('\n')));
  const tools = new F6PublicTools('manus.im',network);
  const query='招聘 Agent 产品经理 怎样看待失败实验与产品取舍';
  expect(await tools.search(query)).toMatchObject({query,results:[{url:'https://manus.im/docs',sourceType:'official_self_description'}]});
  const request = JSON.parse(network.mock.calls[0][1].body);
  expect(network.mock.calls[0][0]).toBe('https://mcp.exa.ai/mcp');
  expect(request.params).toMatchObject({name:'web_search_exa',arguments:{query}});
  expect(await tools.read(['https://other.example/public-article'])).toMatchObject({pages:[{sourceType:'external_attributed_source'}]});
  expect(await tools.read(['https://manus.im/docs'])).toMatchObject({pages:[{text:'URL: https://manus.im/docs\nFetched public page content'}]});
  await tools.read(['https://manus.im/docs']);
  await expect(tools.read(['https://manus.im/docs'])).rejects.toThrow('PUBLIC_REQUEST_BUDGET');
  expect(network).toHaveBeenCalledTimes(4);
});
test.each(['https://127.0.0.1/a','http://manus.im/a','https://x.local/a','https://x.example/a?token=secret'])('rejects unsafe URL %s', url=>{
  expect(()=>f6PublicUrl(url)).toThrow();
});
test('a failed public service is not retried or replaced by a paid service', async()=>{
  const network=jest.fn().mockResolvedValue(new Response('unavailable',{status:503}));
  await expect(new F6PublicTools('manus.im',network).search('产品经理面试筛选证据')).rejects.toThrow();
  expect(network).toHaveBeenCalledTimes(1);
});
test('resuming keeps search provenance and the already-used public budget without repeating requests',async()=>{
  const network=jest.fn().mockImplementation(async()=>result('URL: https://manus.im/docs\nActual source text'));
  const tools=new F6PublicTools('manus.im',network);
  tools.restoreCompletedCalls([{name:'search',output:{results:[{url:'https://manus.im/docs',title:'Manus',sourceType:'official_self_description'}]}},
    {name:'search',output:{results:[]}},{name:'fetch',output:{pages:[]}}]);
  expect(network).not.toHaveBeenCalled();
  const fetched=await tools.read(['https://manus.im/docs']);
  expect(Object.keys(fetched.pages[0]).sort()).toEqual(['sourceType','text','title','url']);
  await expect(tools.search('独立实验如何验证产品判断')).rejects.toThrow('PUBLIC_REQUEST_BUDGET');
  expect(network).toHaveBeenCalledTimes(1);
});

test('only the explicit old experiment adapter retains its frozen topic and search-index protocol',async()=>{
  const network=jest.fn().mockResolvedValue(result('Title: Manus\nURL: https://manus.im/docs\nPublic source'));
  const legacy=f6OriginResearch(new F6PublicTools('manus.im',network),'Manus');
  await expect(legacy.fetch(['https://manus.im/docs'])).rejects.toThrow('FETCH_URL_NOT_FROM_PUBLIC_SEARCH');
  expect(await legacy.search('role')).toMatchObject({topic:'role'});
  expect(JSON.parse(network.mock.calls[0][1].body).params.arguments.query)
    .toBe('Manus Agent product manager hiring job requirements iteration user feedback');
  await expect(legacy.search('arbitrary old topic')).rejects.toThrow('UNKNOWN_PUBLIC_TOPIC');
});
