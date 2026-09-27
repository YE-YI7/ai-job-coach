import {resumePrintHtml,printTemplates} from "./resume-print";
test.each(Object.keys(printTemplates) as (keyof typeof printTemplates)[])("%s keeps real text and print pagination",template=>{
 const html=resumePrintHtml("姓名\n\n教育经历\n真实内容",template,"简历");
 expect(html).toContain("真实内容");expect(html).toContain("@page");expect(html).not.toContain("canvas");expect(html).not.toContain("<img");
});
test("untrusted resume HTML cannot execute",()=>{
 const html=resumePrintHtml('<script>alert(1)</script>',"classic",'<img src=x onerror="x">');
 expect(html).not.toContain("<script>");expect(html).not.toContain("<img");expect(html).toContain("&lt;script&gt;");
});
test.each(Object.keys(printTemplates) as (keyof typeof printTemplates)[])("%s has a real layout while preserving all source lines",template=>{
 const lines=["张三","教育经历","某大学 本科","工作经历","某公司 产品经理","主导真实项目","技能：Python"];
 const html=resumePrintHtml(lines.join("\n"),template,"简历");
 expect(html).toContain(`class="${template}"`);
 for(const line of lines)expect(html).toContain(line);
 expect(html).toContain("grid-template-columns:30mm");
});
