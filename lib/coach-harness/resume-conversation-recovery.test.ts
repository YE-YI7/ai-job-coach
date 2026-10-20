import {resumeMessageFailure,resumeMessageExpired} from './resume-conversation-recovery';
test.each(['Request timed out.','LLM_REQUEST_TIMEOUT','模型超时'])('timeout gets safe recoverable copy: %s',message=>{
 expect(resumeMessageFailure(new Error(message))).toMatchObject({code:'timeout',message:expect.stringContaining('重新发送')});
});
test('provider secrets are never persisted as recovery copy',()=>{
 expect(JSON.stringify(resumeMessageFailure(new Error('network fetch failure with private token')))).not.toContain('private token');
 expect(resumeMessageFailure('当前 AI 额度已用完').code).toBe('quota');
 expect(resumeMessageFailure('401 Authentication').code).toBe('authentication');
});
test('fresh pending is protected; expired receipts recover without claiming success',()=>{
 const turn={id:'i',message:'m',reply:'',savedAt:new Date(1000).toISOString(),status:'pending' as const};
 expect(resumeMessageExpired(turn,90999)).toBe(false);
 expect(resumeMessageExpired(turn,91000)).toBe(true);
 expect(resumeMessageExpired({...turn,status:'completed'},999999)).toBe(false);
});
