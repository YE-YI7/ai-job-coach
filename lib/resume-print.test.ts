import {resumePrintHtml,printTemplates,renderResumePrintWindow} from "./resume-print";
test("inline final view and PDF use the same document body",()=>{
 const final=resumePrintHtml("张三\n\n## 项目\n保留没有上线的限定。","classic","成稿",{toolbar:false});
 const pdf=resumePrintHtml("张三\n\n## 项目\n保留没有上线的限定。","classic","成稿");
 expect(final.match(/<main>[\s\S]*<\/main>/)?.[0]).toBe(pdf.match(/<main>[\s\S]*<\/main>/)?.[0]);
 expect(final).not.toContain('<button id="print">');
});
test("Markdown headings, bullets, links and pagebreak render as document structure", () => {
 const html = resumePrintHtml("# 测试人\n电话：138\n\n简介正文\n\n## 自定义章节\n### 项目 A\n- **负责**需求\n[作品](https://example.com)\n<!-- PAGEBREAK -->\n## 教育背景\n大学", "classic", "简历");
 expect(html).toContain('<h2>自定义章节</h2>');
 expect(html).toContain('<h3>项目 A</h3>');
 expect(html).toContain('<strong>负责</strong>');
 expect(html).toContain('href="https://example.com"');
 expect(html).toContain('class="page-break"');
 expect(html).not.toContain('<!-- PAGEBREAK -->');
 expect(html).not.toContain('## 自定义');
 expect(html).not.toContain('[作品]');
});
test("long first paragraph is not inflated as a name, unsafe links cannot execute", () => {
 const html = resumePrintHtml('这是一个很长的介绍段落。'.repeat(12)+'\n\n## 教育背景\n[点击](javascript:alert)', "classic", "简历");
 expect(html).not.toContain('class="resume-name"');
 expect(html).not.toContain('href="javascript:');
});
test("short lead-in never centres all narrative or enlarges it as a name",()=>{
 const html=resumePrintHtml("张三，探索人机协作\n我想做一个让人与 Agent 协作的系统。\n更多项目原文\n\n教育背景\n某大学","classic","回归");
 expect(html).not.toContain('class="resume-name"');
 expect(html).toContain('<section data-kind="summary">');
 expect(html).toContain("更多项目原文");
});
test("page breaks sit outside layout cells without dropping either side", () => {
 const html = resumePrintHtml("## 自定义章节\n分页前\n<!-- PAGEBREAK -->\n分页后", "modern", "简历");
 expect(html).toContain('分页前</p></div></section><div class="page-break"></div><section');
 expect(html).toContain("分页后</p>");
 expect(html).toContain("align-self:start");
});
test("preview creation does not imply print or PDF saved",()=>{
 let click:()=>void=()=>{};
 const onPrint=jest.fn(),print=jest.fn();
 const target={document:{open:jest.fn(),write:jest.fn(),close:jest.fn(),getElementById:()=>({addEventListener:(_event:string,listener:()=>void)=>{click=listener;}})},print} as unknown as Window;
 renderResumePrintWindow(target,"测试原文","classic","简历",onPrint);
 expect(onPrint).not.toHaveBeenCalled();
 click();expect(print).toHaveBeenCalledTimes(1);expect(onPrint).toHaveBeenCalledTimes(1);
});
test.each(Object.keys(printTemplates) as (keyof typeof printTemplates)[])("%s keeps real text and print pagination",template=>{
 const html=resumePrintHtml("姓名\n\n教育经历\n真实内容",template,"简历");
 expect(html).toContain("真实内容");expect(html).toContain("@page");expect(html).not.toContain("canvas");expect(html).not.toContain("<img");
});
test("untrusted resume HTML cannot execute",()=>{
 const html=resumePrintHtml('<script>alert(1)</script>',"classic",'<img src=x onerror="x">');
 expect(html).not.toContain("<script>");expect(html).not.toContain("<img");expect(html).toContain("&lt;script&gt;");
});
test("warm long nonstandard sections occupy the full page, not an orphaned half-column",()=>{
 const lines=["测试求职者","我提出的问题，和做出的产品",...Array.from({length:30},(_,i)=>`项目段落 ${i}：从需求分析到实现和验证，记录实际决策与结果。`)];
 const html=resumePrintHtml(lines.join("\n\n"),"warm","回归样本");
 expect(html).toContain(".warm main{display:block}");
 expect(html).not.toContain("grid-template-columns:1fr 1fr");
 for(const line of lines)expect(html).toContain(line);
});
test.each(Object.keys(printTemplates) as (keyof typeof printTemplates)[])("%s has a real layout while preserving all source lines",template=>{
 const lines=["张三","教育经历","某大学 本科","工作经历","某公司 产品经理","主导真实项目","技能：Python"];
 const html=resumePrintHtml(lines.join("\n"),template,"简历");
 expect(html).toContain(`class="${template}"`);
 for(const line of lines)expect(html).toContain(line);
 expect(html).toContain(".modern section{display:block}");
 expect(html).not.toContain("grid-template-columns:30mm");
 expect(html).toContain("margin:12mm");
});
