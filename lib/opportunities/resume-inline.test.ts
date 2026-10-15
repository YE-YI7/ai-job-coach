import { resumeInkDiff, resumeInlineProjection } from "./resume-inline";
import { resumePrintHtml } from "../resume-print";
import type { ResumeChange } from "./types";
const edit=(id:string,before:string,after:string,status:ResumeChange['status']='pending'):ResumeChange=>({id,before,after,status,section:'项目',reason:'用真实动作替代重复表述',evidenceId:null});
test('纯增补绿色、删除红色、同位置表达替换黄色，能还原新旧两个版本',()=>{
  const before='整理原始表格并进行重复核对，交付清单。',after='整理表格，交付需求清单。';
  const pieces=resumeInkDiff(before,after);
  expect(pieces.filter(p=>p.kind!=='added'&&p.kind!=='reworded').map(p=>p.text).join('')).toBe(before);
  expect(pieces.filter(p=>p.kind!=='removed').map(p=>p.text).join('')).toBe(after);
  expect(pieces.some(p=>p.kind==='removed')).toBe(true);
  expect(resumeInkDiff('交付清单。','交付需求清单。').some(p=>p.kind==='added')).toBe(true);
  expect(resumeInkDiff('交付表格。','交付清单。').some(p=>p.kind==='reworded')).toBe(true);
});
test('关标记只显示建议后正文，不偷偷采纳；采纳和拒绝去标记并保留各自版本',()=>{
  const source='整理表格。\n交付旧清单。';
  const changes=[edit('one','整理表格。','整理需求清单。'),edit('two','交付旧清单。','交付新清单。','rejected')];
  const clean=resumeInlineProjection(source,changes,false);
  expect(clean.text).toBe('整理需求清单。\n交付旧清单。');expect(clean.ink).toEqual([]);expect(changes[0].status).toBe('pending');
  const accepted=resumeInlineProjection(source,[{...changes[0],status:'accepted'},changes[1]],true);
  expect(accepted).toMatchObject({text:clean.text,ink:[]});
});
test('重复原句与重叠不能错误套用；未定位保留原文，导出一致',()=>{
  expect(resumeInlineProjection('原句。原句。',[edit('a','原句。','新句。')],true)).toMatchObject({text:'原句。原句。',ink:[]});
  const result=resumeInlineProjection('完整原句。',[edit('a','完整原句。','其他。'),edit('b','原句。','不同。')],false);
  expect(result.text).toBe('完整原句。');expect(result.findings).toHaveLength(2);
});
test('多行带粗体的改稿在纸面保留三色与键盘入口，导出无标记、无删除的原文',()=>{
  const source='林验收（虚构）\n邮箱：qa@example.invalid\n\n## 项目经历\n- **整理**旧表格，重复核对，交付清单。';
  const change=edit('a','旧表格，重复核对，交付清单。','需求表格，交付清单。');
  const review=resumeInlineProjection(source,[change],true);
  const html=resumePrintHtml(review.text,'modern','回归',{toolbar:false,ink:review.ink,interactive:true});
  expect(html).toContain('data-change-id="a"');expect(html).toContain('data-ink="removed"');expect(html).toContain('tabindex="0"');expect(html).toContain('<strong>整理</strong>');
  const final=resumePrintHtml(resumeInlineProjection(source,[change],false).text,'modern','PDF',{toolbar:false});
  expect(final).not.toContain('<mark');expect(final).not.toContain('重复核对');expect(final).toContain('需求表格，交付清单。');
});
