import { resumeReplyPrefix, resumeReplyPreview, resumeConversationStream } from './resume-reply-stream';
import { readChatResponse } from './chat-stream';
jest.mock('@/lib/product-events',()=>({trackProductEvent:jest.fn()}));
const plan={action:'discuss',reply:'**亮点**\n\n- 动作与结果。\n- 中文、引号“你好”和😀。',editorBrief:'INTERNAL_PLAN',supplement:null};
test('every chunk boundary yields only a genuine reply prefix, not JSON or internal plans',()=>{
 const raw=JSON.stringify(plan);
 for(let split=0;split<=raw.length;split++){
  const prefix=resumeReplyPrefix(raw.slice(0,split));expect(plan.reply.startsWith(prefix)).toBe(true);expect(prefix).not.toContain('INTERNAL_PLAN');
 }
 expect(resumeReplyPrefix(raw)).toBe(plan.reply);
});
test('escaped JSON, nested spoofed reply, non-decisions and incomplete unicode stay private',()=>{
 expect(resumeReplyPrefix('{"action":"maybe","reply":"hidden"}')).toBe('');
 expect(resumeReplyPrefix('{"meta":{"reply":"hidden"},"action":"discuss","reply":"visible"}')).toBe('visible');
 expect(resumeReplyPrefix('{"action":"discuss","reply":"\\u4e2d\\u6587\\n\\uD83D')).toBe('中文\n');
 expect(resumeReplyPrefix('{"action":"discuss","reply":"\\uD83D\\uDE00"}')).toBe('😀');
});
test('incremental preview holds unmatched stars and does not append final text twice',()=>{
 const output=jest.fn(),push=resumeReplyPreview(output);
 push('{"action":"discuss","reply":"**关于');expect(output).not.toHaveBeenCalled();
 push('亮点**：先看结果。');expect(output).toHaveBeenLastCalledWith('**关于亮点**：先看结果。');
 push('","editorBrief":"INTERNAL_PLAN","supplement":null}');expect(output).toHaveBeenCalledTimes(1);
});
test('revision promises wait for target validation while discussion remains progressive',()=>{
 const revision=jest.fn(),discuss=jest.fn();
 resumeReplyPreview(revision,false)('{"action":"revise","reply":"我会新增一段经历。","supplement":{"sourceExcerpt":""}}');
 expect(revision).not.toHaveBeenCalled();
 resumeReplyPreview(discuss,false)('{"action":"discuss","reply":"我们先确认所属经历。');
 expect(discuss).toHaveBeenCalledWith('我们先确认所属经历。');
});
test('browser receives the first real prefix before completion, and done only after persistence',async()=>{
 let finish!:(value:Response)=>void;const writes:string[]=[];
 const response=resumeConversationStream(async onReply=>{
  onReply('**亮点**\n\n- 已有交付。');
  const result=await new Promise<Response>(resolve=>finish=resolve);writes.push('saved');return result;
 });
 const reader=response.body!.getReader(),decoder=new TextDecoder();
 expect(decoder.decode((await reader.read()).value)).toContain('status');
 expect(decoder.decode((await reader.read()).value)).toContain('replace');expect(writes).toEqual([]);
 finish(Response.json({ok:true,task:{conversation:[{reply:'**亮点**\n\n- 已有交付。'}]}}));
 expect(decoder.decode((await reader.read()).value)).toContain('"type":"done"');expect(writes).toEqual(['saved']);
 await reader.cancel();
});
test('checked snapshots replace prefixes; invalid final output cannot masquerade as saved',async()=>{
 const onText=jest.fn();
 const response=resumeConversationStream(async emit=>{emit('第一句');emit('第一句。第二句');return Response.json({ok:false,error:'输出校验未通过',task:{state:'failed'}},{status:503});});
 const result=await readChatResponse<{ok:boolean}>(response,onText);
 expect(result.ok).toBe(false);expect(onText.mock.calls.map(c=>c[0])).toEqual(['第一句','第一句。第二句']);
});
test('cancelling the display does not duplicate execution or prevent its saved receipt',async()=>{
 let finish!:()=>void;const saved=jest.fn(),execute=jest.fn(async(emit:(s:string)=>void)=>{await new Promise<void>(resolve=>finish=resolve);emit('late');saved();return Response.json({ok:true});});
 const reader=resumeConversationStream(execute).body!.getReader();await reader.read();await reader.cancel();finish();await Promise.resolve();await Promise.resolve();
 expect(execute).toHaveBeenCalledTimes(1);expect(saved).toHaveBeenCalledTimes(1);
});
