import {POST} from './route';
import {POST as tailor} from '../resume/tailor/route';
import {getCurrentUserFromRequest} from '@/lib/auth';
import {callLLM} from '@/lib/llm';
import {buildAgentKnowledgeContext} from '@/lib/knowledge/context';
import {runDeepSeekStrategy} from '@/lib/orchestrator/models/application_strategy';
import {runDeepSeekInterview} from '@/lib/orchestrator/models/interview';
jest.mock('@/lib/auth');jest.mock('@/lib/llm');jest.mock('@/lib/db',()=>({saveWhiteboard:jest.fn()}));jest.mock('@/lib/knowledge/context');
jest.mock('@/lib/metered-ai-route',()=>({withMeteredAiRoute:(fn:unknown)=>fn}));
beforeEach(()=>{jest.resetAllMocks();(getCurrentUserFromRequest as jest.Mock).mockResolvedValue({id:'owner'});(buildAgentKnowledgeContext as jest.Mock).mockResolvedValue({contextText:''});});
test('legacy analysis discards even an unsolicited model percentage, without touching other evidence',async()=>{
 (callLLM as jest.Mock).mockResolvedValue(JSON.stringify({targetCompanies:[{name:'虚构公司',position:'产品经理',matchScore:85,notes:'待核对岗位原文'}]}));
 const response=await POST(new Request('https://example.com/api/analyze',{method:'POST',body:JSON.stringify({messages:[{role:'user',content:'想投虚构公司产品经理'}],userStage:'application_strategy'})}));
 expect(await response.json()).toEqual({targetCompanies:[{name:'虚构公司',position:'产品经理',notes:'待核对岗位原文'}]});
});
test('legacy tailoring response keeps matches and gaps, not a numeric or null score',async()=>{
 (callLLM as jest.Mock).mockResolvedValue(JSON.stringify({match_score:85,key_matches:['需求整理'],gaps:['缺少交付说明']}));
 const response=await tailor(new Request('https://example.com/api/resume/tailor',{method:'POST',body:JSON.stringify({resumeData:{workExperience:'整理需求记录'},jobDescription:'负责需求工作'})}));
 const body=await response.json();expect(body.ok).toBe(true);expect(body.keyMatches).toEqual(['需求整理']);expect(body).not.toHaveProperty('matchScore');
});
test('strategy extraction never invents its former default 80',async()=>{
 (callLLM as jest.Mock).mockResolvedValue('公司：虚构公司');
 const result=await runDeepSeekStrategy([{role:'user',content:'讨论投递'}]);
 expect(result.structured.targetCompanies?.length).toBeGreaterThan(0);
 expect(JSON.stringify(result.structured)).not.toMatch(/matchScore|80/);
});
test('legacy interview heuristic also cannot assign a fixed 80 merely by counting questions',async()=>{
 (callLLM as jest.Mock).mockResolvedValue('继续核对事实。');
 const result=await runDeepSeekInterview([{role:'user',content:'问题：一。问题：二。回答：已有事实。'}]);
 expect(result.structured.interviewReports?.[0]).not.toHaveProperty('overallScore');
});
