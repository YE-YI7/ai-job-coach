import { resumeEditorContext } from './resume-editor-context';

test('orders existing evidence by source, binds exact IDs locally and retains unmatched facts',()=>{
 const resume='业务设计：参与搭建原型；\r\n完成需求文档。\n\n另一项目：协助访谈。';
 const facts='[f3] 另一项目：协助访谈。\n[f2] 完成需求文档。\n[f1] 业务设计：参与搭建原型；\n[f4] 用户补充的独立事实';
 const result=resumeEditorContext(resume,facts);
 expect(result.sourceAnchors[0].before).toBe('业务设计：参与搭建原型；\r\n完成需求文档。');
 expect(result.sourceAnchors[0].sourceIds).toEqual(['f2','f1']);
 expect(result.sourceAnchors[0].sourceClauses).toEqual(['业务设计：参与搭建原型；','完成需求文档。']);
 expect(result.citableFacts.split('\n').map(s=>s.slice(1,3))).toEqual(['f1','f2','f3','f4']);
 expect(new Set(result.citableFacts.split('\n'))).toEqual(new Set(facts.split('\n')));
});
