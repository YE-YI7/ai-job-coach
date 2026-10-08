import {trackProductEvent} from "@/lib/product-events";

/** Hide the structured follow-up and outcome trailers, including a marker split across chunks. */
export function visibleTutorText(text:string) {
  for(const marker of ["<followups>","<outcome"]) {
    const index=text.indexOf(marker);
    if(index>=0)return text.slice(0,index);
    for(let n=marker.length-1;n>0;n--)if(text.endsWith(marker.slice(0,n)))return text.slice(0,-n);
  }
  return text;
}

export async function readChatResponse<T>(response:Response,onText:(text:string)=>void,onStatus?:(message:string)=>void):Promise<T> {
 const started=Date.now();
 try {
  const result=await consumeChatResponse<T>(response,onText,onStatus);
  const body=result as {ok?:boolean;learning_trace?:{timing?:{firstTextMs?:number|null;generationDoneMs?:number}}};
  trackProductEvent(body.ok?"coach_response_received":"coach_response_failed",{http_status:response.status,stream_read_ms:Date.now()-started,server_first_text_ms:body.learning_trace?.timing?.firstTextMs,server_generation_ms:body.learning_trace?.timing?.generationDoneMs});
  return result;
 } catch(error) {
  trackProductEvent("coach_response_failed",{http_status:response.status,stream_read_ms:Date.now()-started,reason_code:"stream_or_decode_failure"});
  throw error;
 }
}

async function consumeChatResponse<T>(response:Response,onText:(text:string)=>void,onStatus?:(message:string)=>void):Promise<T> {
  if(!response.headers.get("content-type")?.includes("application/x-ndjson"))return response.json();
  if(!response.body)throw Error("连接中断，请检查历史后重试");
  const reader=response.body.getReader(),decoder=new TextDecoder();
  let buffer="",text="";
  try {
    while(true){
      const {value,done}=await reader.read();
      buffer+=decoder.decode(value,{stream:!done});
      const lines=buffer.split("\n");buffer=lines.pop()||"";
      if(done&&buffer){lines.push(buffer);buffer="";}
      for(const line of lines){
        if(!line.trim())continue;
        const event=JSON.parse(line);
        if(event.type==="status"&&typeof event.message==="string")onStatus?.(event.message);
        if(event.type==="delta"&&typeof event.text==="string"){text+=event.text;onText(visibleTutorText(text));}
        // Checked snapshots replace earlier text; never append a full answer
        // to its streamed prefix (which makes the answer appear to loop).
        if(event.type==="replace"&&typeof event.text==="string"){text=event.text;onText(visibleTutorText(text));}
        if(event.type==="done")return event as T;
      }
      if(done)throw Error("连接中断，回答尚未确认保存，请检查历史后重试");
    }
  } finally {reader.releaseLock();}
}
