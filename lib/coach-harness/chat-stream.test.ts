import {readChatResponse,visibleTutorText} from "./chat-stream";
test("hides complete and split follow-up trailers",()=>{
 expect(visibleTutorText('答复<followups>["继续"]')).toBe("答复");
 expect(visibleTutorText("答复<follow")).toBe("答复");
 expect(visibleTutorText("正常回答")).toBe("正常回答");
});
test("renders before final persistence confirmation, including fragmented UTF8",async()=>{
 let controller!:ReadableStreamDefaultController<Uint8Array>;
 const response=new Response(new ReadableStream({start(c){controller=c;}}),{headers:{"Content-Type":"application/x-ndjson"}});
 const output=jest.fn();
 const result=readChatResponse<{ok:boolean}>(response,output);
 const bytes=new TextEncoder().encode(JSON.stringify({type:"delta",text:"中文"})+"\n");
 controller.enqueue(bytes.slice(0,25));controller.enqueue(bytes.slice(25));
 await new Promise(resolve=>setTimeout(resolve,0));
 expect(output).toHaveBeenCalledWith("中文");
 controller.enqueue(new TextEncoder().encode('{"type":"done","ok":true}\n'));controller.close();
 expect(await result).toMatchObject({ok:true});
});
test("EOF without done is not reported as saved",async()=>{
 const r=new Response('{"type":"delta","text":"半截"}\n',{headers:{"Content-Type":"application/x-ndjson"}});
 await expect(readChatResponse(r,()=>{})).rejects.toThrow("尚未确认保存");
});
test("JSON compatibility and streamed save errors preserved",async()=>{
 expect(await readChatResponse(Response.json({ok:true,id:"saved"}),()=>{})).toMatchObject({id:"saved"});
 const r=new Response('{"type":"done","ok":false,"error":"未保存"}\n',{headers:{"Content-Type":"application/x-ndjson"}});
 expect(await readChatResponse(r,()=>{})).toMatchObject({ok:false,error:"未保存"});
});
