import {parseResumeConversationDecision,resumeConversationMessages} from './resume-conversation-decision';
import {resumeReplyPreview} from './resume-reply-stream';
import {singleResumeQuestionReply,skipsResumeFact} from './resume-single-question';
const source='实习期间参与产品需求工作，负责收集反馈并整理记录。';
const turns=[{id:'one',message:'我整理了访谈分类表，交给产品经理。',reply:'这份表的用途是什么？',status:'completed' as const,savedAt:'now'},
 {id:'two',message:'你为什么建议写这个，先别改？',reply:'',status:'pending' as const,savedAt:'now'}];
test('discussion cannot manufacture editing instructions or career evidence',()=>{
 const plan=parseResumeConversationDecision(JSON.stringify({action:'discuss',reply:'可以先讨论这项取舍。',editorBrief:'擅自改稿',supplement:{quote:'假设'}}),source,turns);
 expect(plan).toEqual({action:'discuss',reply:'可以先讨论这项取舍。',editorBrief:'',supplement:null});
});
test('only an exact user quotation anchored to source can become a supplement',()=>{
 const plan={action:'revise',reply:'把实习中你实际交付的材料写清楚。',editorBrief:'只修改对应实习，保留参与责任。',supplement:{turnId:'one',quote:'我整理了访谈分类表，交给产品经理。',sourceExcerpt:source,field:'deliverable'}};
 expect(parseResumeConversationDecision(JSON.stringify(plan),source,turns)).toEqual(plan);
 for(const bad of [{quote:'我主导产品实现收入增长20%'},{turnId:'unknown'},{field:'untrusted'}])expect(()=>parseResumeConversationDecision(JSON.stringify({...plan,supplement:{...plan.supplement,...bad}}),source,turns)).toThrow('尚未执行改稿');
 for(const sourceExcerpt of ['','原文没有的经历']){
  const recovered=parseResumeConversationDecision(JSON.stringify({...plan,supplement:{...plan.supplement,sourceExcerpt}}),source,turns);
  expect(recovered).toMatchObject({action:'discuss',supplement:null,editorBrief:''});
  expect(recovered.reply).toContain('哪一段实习或项目');
  expect((recovered.reply.match(/？/g)||[])).toHaveLength(1);
 }
});
test('missing, malformed or incomplete action never falls back to revision',()=>{
 for(const value of ['not json','{}','{"action":"edit","reply":"直接改"}','{"action":"revise","reply":"直接改"}'])expect(()=>parseResumeConversationDecision(value,source,turns)).toThrow();
});
test('mentor sees questions and discussion plus reviewed methods, not an assumed edit request',()=>{
 const input=resumeConversationMessages({resume:source,jd:'',changes:[]},{id:'t',state:'needs_detail',question:null,answers:[],updatedAt:'now',conversation:turns});
 expect(input.knowledge.some(k=>k.id==='resume.progressive-discovery.v1')).toBe(true);
 expect(input.messages[0].content).toContain('发送消息不等于要求执行改稿');
 expect(input.messages[1].content).toContain(turns[1].message);
 expect(input.messages[1].content).toContain('earlierTurnsNotLoaded');
});
test('streamed and saved mentor replies ask the same single question and preserve Markdown',()=>{
 const reply='先用已有事实，不需要编数字。\n\n**你具体交付了什么？**\n\n后来有什么结果？';
 const raw=JSON.stringify({action:'discuss',reply});const onReply=jest.fn(),stream=resumeReplyPreview(onReply);
 for(const char of raw)stream(char);
 const saved=parseResumeConversationDecision(raw,source,turns).reply;
 expect(saved).toBe('先用已有事实，不需要编数字。\n\n**你具体交付了什么？**');
 expect(onReply.mock.calls.at(-1)?.[0]).toBe(saved);
 expect(singleResumeQuestionReply('参考 https://example.org/?a=1，再讨论。')).toContain('?a=1');
 expect(singleResumeQuestionReply('你问“为什么这样写？”我先解释依据，再讨论。')).toBe('你问“为什么这样写？”我先解释依据，再讨论。');
 expect(skipsResumeFact('不知道怎么改')).toBe(false);expect(skipsResumeFact('跳过')).toBe(true);
});
test('a bare unknown or skip cannot invoke editing even if the model says revise',()=>{
 const pending={id:'skip',message:'记不清了',reply:'',status:'pending' as const,savedAt:'now'};
 const plan=parseResumeConversationDecision(JSON.stringify({action:'revise',reply:'没关系，保留已知事实。',editorBrief:'删除未知经历',supplement:null}),source,[...turns,pending]);
 expect(plan).toEqual({action:'discuss',reply:'没关系，保留已知事实。',editorBrief:'',supplement:null});
});
test('multi-turn facts keep exact quotes and corrected placement in one editor handoff',()=>{
 const history=[
  {id:'delivery',message:'交付了供应商对接方案。',reply:'属于哪段经历？',status:'completed' as const,savedAt:'now'},
  {id:'purpose',message:'是为门店比较供应商服务范围。',reply:'',status:'completed' as const,savedAt:'now'},
  {id:'correction',message:'不是A公司，是B项目，就常规一样。',reply:'',status:'pending' as const,savedAt:'now'},
 ];
 const supplements=[
  {turnId:'delivery',quote:history[0].message,sourceExcerpt:source,field:'deliverable'},
  {turnId:'purpose',quote:history[1].message,sourceExcerpt:source,field:'context'},
 ];
 const raw={action:'revise',reply:'我会改这段项目，突出对接方案和实际用途，不补编数据。',editorBrief:'只修改B项目，不能归到已纠正的A公司。',supplements};
 expect(parseResumeConversationDecision(JSON.stringify(raw),source,history)).toEqual({...raw,supplement:supplements[0]});
 for(const invalid of [null,{},Array(5).fill(supplements[0]),[...supplements,{...supplements[0],quote:'提高转化率30%'}]]){
  expect(()=>parseResumeConversationDecision(JSON.stringify({...raw,supplements:invalid}),source,history)).toThrow();
 }
 const duplicate=parseResumeConversationDecision(JSON.stringify({...raw,supplements:[...supplements,supplements[0]]}),source,history);
 expect(duplicate.supplements).toHaveLength(2);
});
test('mentor owns writing choices, keeps replies short and never asks approval for a draft in chat',()=>{
 const prompt=resumeConversationMessages({resume:source,jd:'',changes:[]},{id:'t',state:'ready',question:null,answers:[],updatedAt:'now',conversation:turns}).messages[0].content;
 for(const rule of ['最多180字','不能先在聊天里写一版','以用户最后一次明确纠正为准','已知个人动作或交付且归属确定','用户明确说先别改'])expect(prompt).toContain(rule);
});
test('a scope anchored only to the project heading locates the edit but is not a body-writing fact',()=>{
 const text='## 项目经历\n### B项目\n'+source;
 const decision=parseResumeConversationDecision(JSON.stringify({action:'revise',reply:'我会改B项目。',editorBrief:'只修改B项目',
  supplements:[{turnId:'one',quote:turns[0].message,sourceExcerpt:source,field:'deliverable'},
   {turnId:'correction',quote:'不是A，是B项目',sourceExcerpt:'### B项目',field:'scope'}]}),text,
  [...turns,{id:'correction',message:'不是A，是B项目',reply:'',status:'pending',savedAt:'now'}]);
 expect(decision.supplement?.field).toBe('deliverable');
 expect(decision.supplements).toBeUndefined();
 expect(decision.placements).toEqual([expect.objectContaining({field:'scope',sourceExcerpt:'### B项目'})]);
});
test('plain entry titles are placement, but measured scope on a responsibility remains a fact',()=>{
 const text='项目经历\nB项目\n2025.01 - 2025.03\n'+source;
 const turn={id:'detail',message:'不是A，是B项目；我整理了12份访谈记录。',reply:'',status:'pending' as const,savedAt:'now'};
 const decision=parseResumeConversationDecision(JSON.stringify({action:'revise',reply:'我会改B项目。',editorBrief:'补入实际整理规模',supplements:[
  {turnId:'detail',quote:'不是A，是B项目',sourceExcerpt:'B项目',field:'scope'},
  {turnId:'detail',quote:'我整理了12份访谈记录',sourceExcerpt:source,field:'scope'},
 ]}),text,[turn]);
 expect(decision.placements).toHaveLength(1);
 expect(decision.supplement).toMatchObject({quote:'我整理了12份访谈记录',sourceExcerpt:source,field:'scope'});
});
