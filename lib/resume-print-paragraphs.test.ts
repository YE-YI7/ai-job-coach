import { resumePrintParagraphRuns } from './resume-print-paragraphs';
import { resumePrintHtml, printTemplates } from './resume-print';

const start='医疗需求调研：完成4款竞品分析、6位用户访谈，整理为6类需求，并设计需求体系与原型，';
const end='保留需求映射、模块边界与用户确认的原始证据。';

test('joins only physical wraps, not new labels, headings or separate list entries',()=>{
 const lines=[start,end,'模型评估：保留原结论。','2026.07-至今','- 第一条完整经历。','- 第二条完整经历。'];
 expect([...resumePrintParagraphRuns(lines)]).toEqual([[0,1]]);
 expect([...resumePrintParagraphRuns([start,end,'',start,end])]).toEqual([[0,1],[3,4]]);
});

test('does not turn an overlong paragraph into an unbreakable page',()=>{
 expect(resumePrintParagraphRuns(['细节：'+'长'.repeat(1200),'接续内容。']).size).toBe(0);
});

test.each(Object.keys(printTemplates) as (keyof typeof printTemplates)[])('%s retains every source character, emphasis and exact ink identity',template=>{
 const text='## 工作经历\n'+start+'\n'+end+'\n**另一领头**：已确认事实。';
 const pos=text.indexOf('模块边界');
 const html=resumePrintHtml(text,template,'虚构验收',{toolbar:false,ink:[{id:'retained-ink',start:pos,end:pos+4,kind:'reworded'}]});
 expect(html).toContain('class="resume-body-run"');
 expect(html).toContain('data-change-id="retained-ink"');
 expect(html).toContain('<strong>另一领头</strong>');
 const body=html.match(/<main>([\s\S]*?)<\/main>/)![1].replace(/<[^>]+>/g,'').replace(/\s/g,'');
 expect(body).toBe(text.replace(/^## /,'').replace(/\*\*/g,'').replace(/\s/g,''));
 expect(html).toContain('orphans:3;widows:3');
 expect(html).toContain('break-inside:avoid-page');
});
