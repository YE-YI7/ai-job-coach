import fs from "node:fs";
import path from "node:path";
// 静态UI契约，不替代真实浏览器验收。
const source=fs.readFileSync(path.join(process.cwd(),"components/cockpit/JobResultCard.tsx"),"utf8");
test("卡片保留岗位、地点、出处和导入；长依据默认折叠",()=>{
 expect(source).toContain("{job.title}");expect(source).toContain("{job.company}");expect(source).toContain("job.location");expect(source).toContain("job.url");expect(source).toContain("看看我适不适合");expect(source).toContain("disabled={disabled}");expect(source).toContain("onClick={onImport}");expect(source).toContain("<details");expect(source).not.toMatch(/<details[^>]+\bopen\b/);expect(source).not.toContain("<img");
});
