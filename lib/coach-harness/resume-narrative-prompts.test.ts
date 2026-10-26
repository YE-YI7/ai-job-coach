import { resumeNarrativeMessages } from './resume-narrative-prompts';

test('teaches real information selection without injecting the HUST answer or relaxing review',()=>{
 const messages=resumeNarrativeMessages({resume:'经历：参与原型设计。',jd:'',facts:'事实编号来自调用者',answers:[],instructions:[],styleContract:{},coreMethod:'既有规则',knowledge:'引用资料',currentDecisions:[],feedback:[],lockedPlan:null,lockedChanges:[]});
 const teaching=messages.find(m=>m.content.includes('完全虚构、与本人经历无关'))!.content;
 expect(teaching).toContain('不是事实来源');
 expect(teaching).toContain('after必须真有相应取舍');
 expect(teaching).toContain('本人责任和阶段');
 expect(teaching).not.toMatch(/华中|Geo-RAG|医疗|65%|83%/);
 expect(messages.at(-1)!.content).toContain('仍由独立复核决定');
});
