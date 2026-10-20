import {runResumeConversation} from './resume-conversation';
import {beginResumeMessage,completeResumeMessage,failResumeMessage} from './resume-task';
import {observedResumeLLM} from './eval-observer';
import {withMeteredAiRoute} from '@/lib/metered-ai-route';
jest.mock('./resume-task',()=>({beginResumeMessage:jest.fn(),completeResumeMessage:jest.fn(),failResumeMessage:jest.fn()}));
jest.mock('./eval-observer',()=>({observedResumeLLM:jest.fn()}));
jest.mock('./workspace-eval',()=>({recordWorkspaceResume:jest.fn((_user,request,execute)=>execute(request))}));
jest.mock('@/lib/metered-ai-route',()=>({withMeteredAiRoute:jest.fn(fn=>fn)}));
const id='22222222-2222-4222-8222-222222222222';
const req=()=>new Request('https://example.com/api/coach/resume-agent',{method:'POST'});
const body={opportunityId:'opp',requestId:id,answer:'为什么要这样写，先别改？'};
const task={id:'task',state:'ready',question:null,answers:[],updatedAt:'now',result:{changes:[]},conversation:[{id,message:body.answer,reply:'',status:'pending',savedAt:'now'}]};
beforeEach(()=>{jest.clearAllMocks();(beginResumeMessage as jest.Mock).mockResolvedValue({task,source:{resume:'负责收集需求记录并交给产品经理审阅。',jd:'',changes:[],general:true},version:2,replayed:false});(completeResumeMessage as jest.Mock).mockResolvedValue(task);(withMeteredAiRoute as jest.Mock).mockImplementation(fn=>fn);});
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
 await expect(runResumeConversation(req(),{id:'owner'},body,revise)).rejects.toThrow();expect(revise).not.toHaveBeenCalled();expect(failResumeMessage).toHaveBeenCalledWith('owner','opp',id,2);
});
test('quota failure marks only the pending conversation failed, not the résumé task',async()=>{
 (withMeteredAiRoute as jest.Mock).mockImplementation(()=>async()=>Response.json({error:'额度不足'},{status:403}));
 const revise=jest.fn();expect((await runResumeConversation(req(),{id:'owner'},body,revise)).status).toBe(403);expect(observedResumeLLM).not.toHaveBeenCalled();expect(revise).not.toHaveBeenCalled();expect(failResumeMessage).toHaveBeenCalledTimes(1);
});
