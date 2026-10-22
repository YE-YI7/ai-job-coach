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
 for(const bad of [{quote:'我主导产品实现收入增长20%'},{turnId:'unknown'},{sourceExcerpt:'原文没有的经历'},{field:'untrusted'}])expect(()=>parseResumeConversationDecision(JSON.stringify({...plan,supplement:{...plan.supplement,...bad}}),source,turns)).toThrow('尚未执行改稿');
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
