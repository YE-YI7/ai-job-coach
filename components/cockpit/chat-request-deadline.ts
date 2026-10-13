/** A missing response header or stalled stream must not lock the composer forever. */
export async function withChatRequestDeadline<T>(work:(signal:AbortSignal)=>Promise<T>,timeoutMs=150_000):Promise<T>{
  const controller=new AbortController();
  let timer:ReturnType<typeof setTimeout>|undefined;
  const deadline=new Promise<never>((_,reject)=>{
    timer=setTimeout(()=>{
      reject(new Error("聊天连接超时，原回答已保留。请重新打开学习记录确认结果后继续，避免重复提交。"));
      controller.abort();
    },timeoutMs);
  });
  try{return await Promise.race([work(controller.signal),deadline]);}
  finally{if(timer!==undefined)clearTimeout(timer);}
}
