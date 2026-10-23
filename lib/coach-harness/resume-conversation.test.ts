import {runResumeConversation} from './resume-conversation';
import {beginResumeMessage,completeResumeMessage,failResumeMessage,readResumeTask} from './resume-task';
import {observedResumeLLM} from './eval-observer';
import {withMeteredAiRoute} from '@/lib/metered-ai-route';
jest.mock('./resume-task',()=>({beginResumeMessage:jest.fn(),completeResumeMessage:jest.fn(),failResumeMessage:jest.fn(),readResumeTask:jest.fn(),ResumeTaskError:class extends Error{status=409}}));
jest.mock('./eval-observer',()=>({observedResumeLLM:jest.fn()}));
jest.mock('./workspace-eval',()=>({recordWorkspaceResume:jest.fn((_user,request,execute)=>execute(request)),workspaceEvalEnabled:()=>true}));
jest.mock('@/lib/metered-ai-route',()=>({withMeteredAiRoute:jest.fn(fn=>fn)}));
const id='22222222-2222-4222-8222-222222222222';
const req=()=>new Request('https://example.com/api/coach/resume-agent',{method:'POST'});
const body={opportunityId:'opp',requestId:id,answer:'为什么要这样写，先别改？'};
const task={id:'task',state:'ready',question:null,answers:[],updatedAt:'now',result:{changes:[]},conversation:[{id,message:body.answer,reply:'',status:'pending',savedAt:'now'}]};
beforeEach(()=>{jest.clearAllMocks();(beginResumeMessage as jest.Mock).mockResolvedValue({task,source:{resume:'负责收集需求记录并交给产品经理审阅。',jd:'',changes:[],general:true},version:2,replayed:false});(completeResumeMessage as jest.Mock).mockResolvedValue(task);(readResumeTask as jest.Mock).mockResolvedValue(task);(failResumeMessage as jest.Mock).mockResolvedValue(undefined);(withMeteredAiRoute as jest.Mock).mockImplementation(fn=>fn);});
test('a normal discussion saves a reply without invoking editor',async()=>{
 (observedResumeLLM as jest.Mock).mockResolvedValue(JSON.stringify({action:'discuss',reply:'这条描述能呈现具体交付，我们可以先比较写法。'}));
 const revise=jest.fn();const response=await runResumeConversation(req(),{id:'owner'},body,revise);
 expect(await response.json()).toMatchObject({ok:true,conversationDecision:'discuss'});expect(revise).not.toHaveBeenCalled();expect(completeResumeMessage).toHaveBeenCalledWith('owner','opp',id,2,expect.objectContaining({action:'discuss',supplement:null}));
});
test('only validated semantic revise decision dispatches the original editor once',async()=>{
 (observedResumeLLM as jest.Mock).mockResolvedValue(JSON.stringify({action:'revise',reply:'我会精简重复的描述。',editorBrief:'精简实习经历，保持事实和责任边界。',supplement:null}));
 const revise=jest.fn().mockResolvedValue({...task,state:'ready'});
 await runResumeConversation(req(),{id:'owner'},body,revise);expect(revise).toHaveBeenCalledTimes(1);expect(revise).toHaveBeenCalledWith(id);
});
test('same saved message replays without model or quota reservation',async()=>{
 (beginResumeMessage as jest.Mock).mockResolvedValue({task,replayed:true});
 await runResumeConversation(req(),{id:'owner'},body,jest.fn());expect(withMeteredAiRoute).not.toHaveBeenCalled();expect(observedResumeLLM).not.toHaveBeenCalled();
});
test('a saved revise decision interrupted before claiming resumes editor without rerunning mentor',async()=>{
 (beginResumeMessage as jest.Mock).mockResolvedValue({task,replayed:true,needsRevision:true});
 const revise=jest.fn().mockResolvedValue(task);
 expect((await runResumeConversation(req(),{id:'owner'},body,revise)).status).toBe(200);
 expect(revise).toHaveBeenCalledWith(id);expect(revise).toHaveBeenCalledTimes(1);
 expect(withMeteredAiRoute).not.toHaveBeenCalled();expect(observedResumeLLM).not.toHaveBeenCalled();
});
test('bad output never invokes editor and preserves a retryable message',async()=>{
 (observedResumeLLM as jest.Mock).mockResolvedValue('{"action":"maybe"}');const revise=jest.fn();
 expect((await runResumeConversation(req(),{id:'owner'},body,revise)).status).toBe(503);expect(revise).not.toHaveBeenCalled();expect(failResumeMessage).toHaveBeenCalledWith('owner','opp',id,2,expect.objectContaining({code:'unavailable',traceId:expect.any(String)}));
});
test('upstream timeout returns a saved retryable receipt, not a raw provider error or edit',async()=>{
 (observedResumeLLM as jest.Mock).mockRejectedValue(new Error('Request timed out. secret upstream context'));
 const failed={...task,conversation:[{...task.conversation[0],status:'failed'}]};
 (readResumeTask as jest.Mock).mockResolvedValue(failed);
 const revise=jest.fn(),response=await runResumeConversation(req(),{id:'owner'},body,revise);
 expect(response.status).toBe(503);expect(await response.json()).toMatchObject({ok:false,error:expect.stringContaining('超时'),task:failed});
 expect(failResumeMessage).toHaveBeenCalledWith('owner','opp',id,2,expect.objectContaining({code:'timeout',traceId:expect.any(String)}));
 expect(observedResumeLLM).toHaveBeenCalledTimes(1);expect(revise).not.toHaveBeenCalled();
 expect(observedResumeLLM).toHaveBeenCalledWith(expect.any(Array),expect.objectContaining({onDelta:expect.any(Function),maxRetries:0,timeoutMs:45000}));
});
test('a later editor error is returned to the route so its lease is finalized',async()=>{
 (observedResumeLLM as jest.Mock).mockResolvedValue(JSON.stringify({action:'revise',reply:'准备精简。',editorBrief:'只精简原文',supplement:null}));
 (readResumeTask as jest.Mock).mockResolvedValue({...task,conversation:[{...task.conversation[0],status:'completed',decision:'revise'}]});
 await expect(runResumeConversation(req(),{id:'owner'},body,jest.fn().mockRejectedValue(new Error('editor failure')))).rejects.toThrow('editor failure');
});
test('quota failure marks only the pending conversation failed, not the résumé task',async()=>{
 (withMeteredAiRoute as jest.Mock).mockImplementation(()=>async()=>Response.json({error:'额度不足'},{status:403}));
 const revise=jest.fn();expect((await runResumeConversation(req(),{id:'owner'},body,revise)).status).toBe(403);expect(observedResumeLLM).not.toHaveBeenCalled();expect(revise).not.toHaveBeenCalled();expect(failResumeMessage).toHaveBeenCalledTimes(1);
});
test('streamed reply reaches display before full JSON, without persisting a plan or invoking editor early',async()=>{
 const onReply=jest.fn(),revise=jest.fn();
 const raw=JSON.stringify({action:'discuss',reply:'**已有事实**\n\n- 先讨论具体交付。',editorBrief:'',supplement:null});
 (observedResumeLLM as jest.Mock).mockImplementation(async(_messages,options)=>{
  options.onDelta(raw.slice(0,-1));expect(onReply).toHaveBeenCalledWith('**已有事实**\n\n- 先讨论具体交付。');
  expect(completeResumeMessage).not.toHaveBeenCalled();expect(revise).not.toHaveBeenCalled();return raw;
 });
 expect((await runResumeConversation(req(),{id:'owner'},body,revise,onReply)).status).toBe(200);
 expect(completeResumeMessage).toHaveBeenCalledTimes(1);expect(observedResumeLLM).toHaveBeenCalledTimes(1);expect(revise).not.toHaveBeenCalled();
});
test('streaming an incomplete JSON reply does not weaken the final parse gate',async()=>{
 (observedResumeLLM as jest.Mock).mockImplementation(async(_messages,options)=>{const raw='{"action":"revise","reply":"准备修改。';options.onDelta(raw);return raw;});
 const revise=jest.fn();expect((await runResumeConversation(req(),{id:'owner'},body,revise,jest.fn())).status).toBe(503);
 expect(completeResumeMessage).not.toHaveBeenCalled();expect(revise).not.toHaveBeenCalled();expect(failResumeMessage).toHaveBeenCalledTimes(1);
});
test('an unplaced self-report is saved as a clarifying conversation, without streaming a false edit promise',async()=>{
 const answer='交付了达人的对接方案，分析各个达人的特点并定制方案。';
 const opened={...task,conversation:[{...task.conversation[0],message:answer}]};
 (beginResumeMessage as jest.Mock).mockResolvedValue({task:opened,source:{resume:'虚构实习：负责整理品牌分析报告，交给运营负责人。',jd:'',changes:[],general:true},version:2,replayed:false});
 (completeResumeMessage as jest.Mock).mockImplementation(async(_u,_o,_id,_v,plan)=>({...opened,conversation:[{...opened.conversation[0],status:'completed',reply:plan.reply,decision:plan.action}]}));
 const raw=JSON.stringify({action:'revise',reply:'我会新增一段实习并应用之前的修改。',editorBrief:'新增达人经历',supplement:{turnId:id,quote:answer,sourceExcerpt:'',field:'deliverable'}});
 (observedResumeLLM as jest.Mock).mockImplementation(async(_m,options)=>{for(const char of raw)options.onDelta(char);return raw;});
 const preview=jest.fn(),receipt=jest.fn(),revise=jest.fn();
 const response=await runResumeConversation(req(),{id:'owner'},{...body,answer},revise,preview,receipt);
 expect(await response.json()).toMatchObject({ok:true,conversationDecision:'discuss',task:{conversation:[{status:'completed',message:answer}]}});
 expect(revise).not.toHaveBeenCalled();expect(failResumeMessage).not.toHaveBeenCalled();
 expect(preview).toHaveBeenCalledTimes(1);expect(preview.mock.calls[0][0]).toContain('哪一段实习或项目');expect(JSON.stringify(preview.mock.calls)).not.toContain('新增一段');
 expect(receipt).toHaveBeenCalledTimes(2);expect(receipt.mock.calls[0][0].conversation[0].status).toBe('pending');expect(receipt.mock.calls[1][0].conversation[0].status).toBe('completed');
});
test('saved mentor receipt reaches the browser before a later editor fails',async()=>{
 const completed={...task,conversation:[{...task.conversation[0],status:'completed',reply:'准备精简对应段落。',decision:'revise'}]};
 (completeResumeMessage as jest.Mock).mockResolvedValue(completed);(readResumeTask as jest.Mock).mockResolvedValue(completed);
 (observedResumeLLM as jest.Mock).mockResolvedValue(JSON.stringify({action:'revise',reply:'准备精简对应段落。',editorBrief:'只精简这段',supplement:null}));
 const receipt=jest.fn(),revise=jest.fn(async()=>{expect(receipt).toHaveBeenLastCalledWith(completed);throw Error('editor failed');});
 await expect(runResumeConversation(req(),{id:'owner'},body,revise,jest.fn(),receipt)).rejects.toThrow('editor failed');
 expect(receipt).toHaveBeenCalledTimes(2);
});
