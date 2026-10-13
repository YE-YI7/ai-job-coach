import {selectResumeEvidence,recallLearningHistory} from './evidence-retrieval';
import {getDbClient} from '@/lib/db';
import {compileContextBundle} from './context';
import {renderContextForPrompt} from './prompt';
jest.mock('@/lib/db');
test('简历相关原句有原始行号，不砍句尾、不改写原文',()=>{
 const original=Array.from({length:100},(_,i)=>`普通履历第${i}行，记录实际完成的常规工作。`).join('\n')+'\n主导客服RAG项目，转人工率下降18%，仅限测试周期。';
 const r=selectResumeEvidence(original,'客服 RAG 转人工率',180);
 expect(r.partial).toBe(true);expect(r.text).toContain('原简历第101行：主导客服RAG项目，转人工率下降18%，仅限测试周期。');
 expect(original.split('\n')).toHaveLength(101);
});
test('预算排除仍声明简历存在，不能让模型反问上传',()=>{
 const c=compileContextBundle({userId:'owner',task:'mock_interview',claims:[],claimSelection:'relevant',materialInventory:[{id:'resume-text',label:'已上传简历',partial:true}],attachments:[{id:'resume-text',label:'简历',text:'长'.repeat(9000)}],budget:{maxInputTokens:4000}});
 expect(renderContextForPrompt(c).text).toContain('已上传简历已保存；本轮未装入');
});
test('旧原话从实际RPC回指，同账号同会话且排除最近窗口',async()=>{
 const rpc=jest.fn().mockResolvedValue({data:[{id:'older',question:'我只考虑杭州，请不要推荐上海。',answer:'收到，先围绕杭州。',opportunity_id:'prior-job',created_at:'2026-09-01'}]});
 (getDbClient as jest.Mock).mockResolvedValue({rpc});
 const r=await recallLearningHistory('owner','session','杭州',['recent']);
 expect(r.text).toContain('我只考虑杭州');expect(r.text).toContain('跨岗仅作衔接');expect(r.ids).toEqual(['older']);
 expect(rpc).toHaveBeenCalledWith('search_coach_learning_history',expect.objectContaining({p_user_id:'owner',p_session_id:'session',p_exclude_ids:['recent']}));
});
