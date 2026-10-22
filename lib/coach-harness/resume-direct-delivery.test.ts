import {observeDirectResume} from './resume-direct-delivery';
import {recordResumeServerEvent} from './resume-delivery-record';
jest.mock('./resume-delivery-record',()=>({recordResumeServerEvent:jest.fn().mockResolvedValue('recorded')}));
jest.mock('./resume-trace',()=>({readResumeTrace:jest.fn().mockResolvedValue(null)}));
const request=(body:unknown)=>new Request('https://example.invalid/draft',{method:'POST',body:JSON.stringify(body)});
beforeEach(()=>jest.clearAllMocks());
test('direct output remains returned-only and tasks are not double observed',async()=>{
 const execute=jest.fn().mockResolvedValue(Response.json({ok:true,changes:[{id:'new'}]}));
 expect((await observeDirectResume('owner',request({resumeText:'虚构材料'}),execute)).status).toBe(200);
 expect(recordResumeServerEvent).toHaveBeenLastCalledWith('owner','resume_task_outcome',expect.any(String),expect.objectContaining({persistence:'returned_only',outcome:'unknown'}),expect.anything());
 jest.clearAllMocks();await observeDirectResume('owner',request({resumeText:'虚构材料',resumeTaskId:'task'}),execute);
 expect(recordResumeServerEvent).not.toHaveBeenCalled();
});
test('transport failure is recorded once without retrying the model',async()=>{
 const execute=jest.fn().mockRejectedValue(Error('closed'));
 await expect(observeDirectResume('owner',request({resumeText:'虚构材料'}),execute)).rejects.toThrow('closed');
 expect(execute).toHaveBeenCalledTimes(1);expect(recordResumeServerEvent).toHaveBeenCalledTimes(2);
 expect(recordResumeServerEvent).toHaveBeenLastCalledWith('owner','resume_task_outcome',expect.any(String),expect.objectContaining({outcome:'failed'}),expect.anything());
});
