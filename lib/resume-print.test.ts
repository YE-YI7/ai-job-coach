import {resumePrintHtml,printTemplates} from "./resume-print";
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
 expect(html).toContain("grid-template-columns:30mm");
});
