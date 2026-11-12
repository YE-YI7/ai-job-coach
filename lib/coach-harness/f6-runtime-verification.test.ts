import {verifyDeployedF6Runtime} from './f6-runtime-verification';
import {F6_MENTOR_TOOLS} from './f6-output-channels';
import origin from './f6-origin.json';
jest.mock('./f6-render-pdf',()=>({renderF6Pdf:jest.fn(async()=>({
  bytes:new Uint8Array([1,2,3]),receipt:{pages:1,font:8.5,margin:10,lastPageFill:.5,textLayer:true},
}))}));

test('deployed verification exercises the production free-query/direct-read contract, not the old topic menu',async()=>{
  const requests:Array<{name:string;arguments:Record<string,unknown>}>=[];
  const network=jest.spyOn(global,'fetch').mockImplementation(async(_url,options)=>{
    const params=JSON.parse(String(options?.body)).params;
    requests.push(params);
    const text=params.name==='web_fetch_exa'
      ?'URL: '+params.arguments.urls[0]+'\nPublic teaching article'
      :'Title: Public hiring source\nURL: https://example.com/role\nPublic requirements';
    return new Response(JSON.stringify({result:{content:[{type:'text',text}]}}));
  });
  try{
    const result=await verifyDeployedF6Runtime();
    expect(result.modelCalls).toBe(0);
    expect(requests.map(item=>item.name)).toEqual(['web_fetch_exa','web_search_exa']);
    expect(requests[1].arguments.query).toBe('Agent product manager evaluation ownership evidence');
    expect(result.tools).toEqual(F6_MENTOR_TOOLS);
    expect(result.originTools).toEqual(origin.tools);
    expect(result.tools.find(tool=>tool.function.name==='search')!.function.parameters.required).toEqual(['query']);
    expect(result.reads).toHaveLength(10);
    expect(result.pdfEvidence).toMatchObject({pages:1,textLayer:true});
  }finally{network.mockRestore();}
});
