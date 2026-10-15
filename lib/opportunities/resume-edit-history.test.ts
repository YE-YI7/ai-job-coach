import {editableResumeBlock,editResumeBlock,rememberResumeEdit,travelResumeEdit} from './resume-edit-history';
import type {Opportunity,ResumeChange} from './types';
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
