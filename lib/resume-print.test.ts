import {resumePrintHtml,printTemplates} from "./resume-print";
test.each(Object.keys(printTemplates) as (keyof typeof printTemplates)[])("%s keeps real text and print pagination",template=>{
 const html=resumePrintHtml("姓名\n\n教育经历\n真实内容",template,"简历");
 expect(html).toContain("真实内容");expect(html).toContain("@page");expect(html).not.toContain("canvas");expect(html).not.toContain("<img");
});
test("untrusted resume HTML cannot execute",()=>{
 const html=resumePrintHtml('<script>alert(1)</script>',"classic",'<img src=x onerror="x">');
 expect(html).not.toContain("<script>");expect(html).not.toContain("<img");expect(html).toContain("&lt;script&gt;");
});
