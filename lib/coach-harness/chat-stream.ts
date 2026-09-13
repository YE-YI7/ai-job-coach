/** Hide the structured follow-up trailer, including a marker split across chunks. */
export function visibleTutorText(text:string) {
  const marker="<followups>";
  const index=text.indexOf(marker);
  if(index>=0)return text.slice(0,index);
  for(let n=marker.length-1;n>0;n--)if(text.endsWith(marker.slice(0,n)))return text.slice(0,-n);
  return text;
}

export async function readChatResponse<T>(response:Response,onText:(text:string)=>void):Promise<T> {
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
        if(event.type==="delta"&&typeof event.text==="string"){text+=event.text;onText(visibleTutorText(text));}
        if(event.type==="done")return event as T;
      }
      if(done)throw Error("连接中断，回答尚未确认保存，请检查历史后重试");
    }
  } finally {reader.releaseLock();}
}
