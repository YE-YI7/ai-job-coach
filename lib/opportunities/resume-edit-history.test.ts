import {editableResumeBlock,editResumeBlock,rememberResumeEdit,travelResumeEdit} from './resume-edit-history';
import type {Opportunity,ResumeChange} from './types';
import {applyResumeChanges} from '../coach-harness/application-quality';
import {splitResumeBlocks} from './resume-blocks';
const change:ResumeChange={id:'c',section:'技能',before:'整理资料',after:'整理项目资料',reason:'具体',status:'accepted',evidenceId:null};
const item={resumeText:'林禾\n\n## 专业技能\n整理资料',resumeChanges:[change],resumeOriginal:{name:'original.pdf'},interviewPractices:[{answer:'旧作答'}]} as unknown as Opportunity;
test('采纳后的普通文字可继续编辑，保存只影响该段，不改原件和旧作答',()=>{
 const block=editableResumeBlock(item,'skill-1');expect(block?.text).toBe('整理项目资料');
 const edited=editResumeBlock(item,'skill-1','整理项目交付资料','整理项目资料');
 expect(edited.resumeChanges).toHaveLength(1);expect(edited.resumeChanges[0]).toMatchObject({after:'整理项目交付资料',status:'accepted',editedByUser:true});
 expect(edited.resumeOriginal).toBe(item.resumeOriginal);expect(edited.interviewPractices).toBe(item.interviewPractices);
 expect(travelResumeEdit(edited,'undo').resumeChanges).toEqual(item.resumeChanges);
 expect(travelResumeEdit(travelResumeEdit(edited,'undo'),'redo').resumeChanges).toEqual(edited.resumeChanges);
});
test('拒绝保存已过期的段落编辑，并且历史只保留最近十五步',()=>{
 expect(()=>editResumeBlock(item,'skill-1','新文字','过期文字')).toThrow('已变化');
 let current=item;for(let i=0;i<20;i++)current=rememberResumeEdit(current,{...current,resumeText:`第${i}版`});
 expect(current.resumeEditHistory?.past).toHaveLength(15);
});
test('刷新带回的旧历史不能撤销新一轮生成的改稿',()=>{
 const edited=rememberResumeEdit({...item,resumeGenerationId:'first'},{...item,resumeGenerationId:'first',resumeChanges:[]});
 const next={...edited,resumeGenerationId:'second',resumeChanges:[{...change,after:'新一轮交付'}]};
 expect(travelResumeEdit(next,'undo')).toBe(next);
 const fresh=rememberResumeEdit(next,{...next,resumeChanges:[]});
 expect(fresh.resumeEditHistory?.past).toHaveLength(1);
 expect(travelResumeEdit(fresh,'undo').resumeChanges).toEqual(next.resumeChanges);
});
const displayed=(item:Opportunity)=>applyResumeChanges(item.resumeText||'',item.resumeChanges).text;
test('heading-only blocks open, rename and survive serialization, undo and redo',()=>{
 const source={...item,resumeText:'林禾\n\n## 我提出的问题，和做出的产品\n\n### 测试项目\n- 整理需求清单',resumeChanges:[]};
 const heading=editableResumeBlock(source,'other-1');expect(heading).toMatchObject({headingOnly:true,text:'我提出的问题，和做出的产品'});
 const edited=editResumeBlock(source,'other-1','项目实践',heading!.text);
 expect(edited.resumeText).toContain('## 项目实践\n\n### 测试项目');
 const restored=JSON.parse(JSON.stringify(edited));expect(displayed(travelResumeEdit(restored,'undo'))).toBe(source.resumeText);
 expect(displayed(travelResumeEdit(travelResumeEdit(restored,'undo'),'redo'))).toBe(edited.resumeText);
 expect(edited.interviewPractices).toBe(source.interviewPractices);
});
test('clear deletes an accepted block and its empty heading, leaves adjacent content editable',()=>{
 const source={...item,resumeText:item.resumeText+'\n\n## 教育背景\n示例大学',resumeChanges:[change]};
 const deleted=editResumeBlock(source,'skill-1','   ','整理项目资料');
 expect(displayed(deleted)).not.toMatch(/专业技能|整理/);expect(displayed(deleted)).toContain('示例大学');expect(deleted.resumeChanges).toEqual([]);
 expect(editableResumeBlock(deleted,'education-1')?.text).toBe('示例大学');
 expect(displayed(travelResumeEdit(JSON.parse(JSON.stringify(deleted)),'undo'))).toBe(displayed(source));
 expect(deleted.resumeOriginal).toBe(source.resumeOriginal);
});
test('deleting the first of sibling entries preserves their shared section heading',()=>{
 const source={...item,resumeText:'林禾\n\n## 项目经历\n**甲项目**\n- 编写页面\n\n**乙项目**\n- 整理清单',resumeChanges:[]};
 const deleted=editResumeBlock(source,'project-1','','**甲项目**\n- 编写页面');
 expect(displayed(deleted)).toContain('## 项目经历');expect(displayed(deleted)).not.toContain('甲项目');
 expect(editableResumeBlock(deleted,'project-1')?.text).toBe('**乙项目**\n- 整理清单');
 expect(splitResumeBlocks(displayed(deleted))).toHaveLength(2);
});
test('deleting a heading alone never deletes the following projects',()=>{
 const source={...item,resumeText:'## 项目概览\n\n### 原型一\n- 记录反馈',resumeChanges:[]};
 const deleted=editResumeBlock(source,'project-0','','项目概览');
 expect(displayed(deleted)).not.toContain('项目概览');expect(displayed(deleted)).toContain('### 原型一\n- 记录反馈');
});
test('deleting the final block uses a persisted empty decision, never an accidental empty-source autosave',()=>{
 const source={...item,resumeText:'## 技能\nExcel、Word',resumeChanges:[]};
 const deleted=editResumeBlock(source,'skill-0','','Excel、Word');
 expect(deleted.resumeText).toBe(source.resumeText);expect(displayed(JSON.parse(JSON.stringify(deleted)))).toBe('');
 expect(displayed(travelResumeEdit(deleted,'undo'))).toBe(source.resumeText);
});
