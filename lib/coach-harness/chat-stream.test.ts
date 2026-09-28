import {readChatResponse,visibleTutorText} from "./chat-stream";
import {trackProductEvent} from "@/lib/product-events";
jest.mock("@/lib/product-events",()=>({trackProductEvent:jest.fn()}));
test("completion telemetry contains timings, never the user's content",async()=>{
 (trackProductEvent as jest.Mock).mockClear();
 await readChatResponse(Response.json({ok:true,answer:"private content",learning_trace:{timing:{firstTextMs:123,generationDoneMs:456}}}),()=>{});
 expect(trackProductEvent).toHaveBeenCalledWith("coach_response_received",expect.objectContaining({server_first_text_ms:123,server_generation_ms:456}));
 expect(JSON.stringify((trackProductEvent as jest.Mock).mock.calls)).not.toContain("private content");
});
test("an incomplete stream is recorded as failed, never received",async()=>{
 (trackProductEvent as jest.Mock).mockClear();
 await expect(readChatResponse(new Response('{"type":"delta","text":"partial"}\n',{headers:{"content-type":"application/x-ndjson"}}),()=>{})).rejects.toThrow();
 expect(trackProductEvent).toHaveBeenCalledWith("coach_response_failed",expect.objectContaining({reason_code:"stream_or_decode_failure"}));
 expect(trackProductEvent).not.toHaveBeenCalledWith("coach_response_received",expect.anything());
});
test("checked snapshots and completion never duplicate the streamed answer",async()=>{
 const output=jest.fn();const events=[{type:"replace",text:"第一句。"},{type:"replace",text:"第一句。第二句。"},{type:"replace",text:"第一句。第二句。"},{type:"done",ok:true,answer:"第一句。第二句。"}];
 await readChatResponse(new Response(events.map(e=>JSON.stringify(e)).join("\n"),{headers:{"Content-Type":"application/x-ndjson"}}),output);
 expect(output.mock.calls.at(-1)[0]).toBe("第一句。第二句。");
});
test("progress updates do not render as answer text",async()=>{
 const onText=jest.fn(),onStatus=jest.fn();
 const r=new Response('{"type":"status","message":"正在核对…"}\n{"type":"done","ok":true}\n',{headers:{"Content-Type":"application/x-ndjson"}});
 await readChatResponse(r,onText,onStatus);
 expect(onStatus).toHaveBeenCalledWith("正在核对…");expect(onText).not.toHaveBeenCalled();
});
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
