import {F6PublicTools, f6PublicUrl} from './f6-public-tools';
const result = (text: string) => new Response(JSON.stringify({jsonrpc:'2.0', result:{content:[{type:'text',text}]}}));
test('same keyless search/reader protocol, four-request cap, and no private input in queries', async () => {
  const network = jest.fn().mockResolvedValueOnce(result('Title: Manus research\nURL: https://manus.im/docs\nPublished Date: 2026-11-01\nAuthor: Manus\npublic summary'))
    .mockImplementation(async()=>result('URL: https://manus.im/docs\nFetched public page content'));
  const tools = new F6PublicTools('Manus','manus.im',network);
  expect(await tools.search('role')).toMatchObject({results:[{url:'https://manus.im/docs',sourceType:'official_self_description'}]});
  const request = JSON.parse(network.mock.calls[0][1].body);
  expect(network.mock.calls[0][0]).toBe('https://mcp.exa.ai/mcp');
  expect(request.params).toMatchObject({name:'web_search_exa',arguments:{query:'Manus Agent product manager hiring job requirements iteration user feedback'}});
  await expect(tools.read(['https://other.example/secret'])).rejects.toThrow('FETCH_URL_NOT_FROM_PUBLIC_SEARCH');
  expect(await tools.read(['https://manus.im/docs'])).toMatchObject({pages:[{text:'URL: https://manus.im/docs\nFetched public page content'}]});
  await tools.read(['https://manus.im/docs']); await tools.read(['https://manus.im/docs']);
  await expect(tools.read(['https://manus.im/docs'])).rejects.toThrow('PUBLIC_REQUEST_BUDGET');
  expect(network).toHaveBeenCalledTimes(4);
});
test.each(['https://127.0.0.1/a','http://manus.im/a','https://x.local/a','https://x.example/a?token=secret'])('rejects unsafe URL %s', url=>{
  expect(()=>f6PublicUrl(url)).toThrow();
});
test('a failed public service is not retried or replaced by a paid service', async()=>{
  const network=jest.fn().mockResolvedValue(new Response('unavailable',{status:503}));
  await expect(new F6PublicTools('Manus','manus.im',network).search('role')).rejects.toThrow();
  expect(network).toHaveBeenCalledTimes(1);
});
test('resuming keeps search provenance and the already-used public budget without repeating requests',async()=>{
  const network=jest.fn().mockImplementation(async()=>result('URL: https://manus.im/docs\nActual source text'));
  const tools=new F6PublicTools('Manus','manus.im',network);
  tools.restoreCompletedCalls([{name:'search',output:{results:[{url:'https://manus.im/docs',title:'Manus',sourceType:'official_self_description'}]}},
    {name:'search',output:{results:[]}},{name:'fetch',output:{pages:[]}}]);
  expect(network).not.toHaveBeenCalled();
  const fetched=await tools.read(['https://manus.im/docs']);
  expect(Object.keys(fetched.pages[0]).sort()).toEqual(['sourceType','text','title','url']);
  await expect(tools.search('role')).rejects.toThrow('PUBLIC_REQUEST_BUDGET');
  expect(network).toHaveBeenCalledTimes(1);
});
