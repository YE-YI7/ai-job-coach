import fs from "node:fs";
import path from "node:path";
// 静态UI契约，不替代真实浏览器验收。
const source=fs.readFileSync(path.join(process.cwd(),"components/cockpit/JobResultCard.tsx"),"utf8");
test("卡片保留岗位、地点、出处和导入；长依据默认折叠",()=>{
 expect(source).toContain("{job.title}");expect(source).toContain("{job.company}");expect(source).toContain("job.location");expect(source).toContain("job.url");expect(source).toContain("看看我适不适合");expect(source).toContain("disabled={disabled}");expect(source).toContain("onClick={onImport}");expect(source).toContain("<details");expect(source).not.toMatch(/<details[^>]+\bopen\b/);expect(source).toContain("companyLogo(job.company)");expect(source).toContain("<Image");expect(source).not.toContain("Building2");
});
test("岗位结果直接展示，不重复解释按钮和下一步",()=>{
 const discovery=fs.readFileSync(path.join(process.cwd(),"components/cockpit/JobDiscovery.tsx"),"utf8");
 const profile=fs.readFileSync(path.join(process.cwd(),"components/cockpit/ProfileWorkspace.tsx"),"utf8");
 for(const copy of ["接下来，选一个岗位推进","基础简历会带入新岗位","为你找国内机会","按已保存的方向和城市筛选","点「看看我适不适合」继续"]){expect(profile+discovery).not.toContain(copy);}
 expect(discovery).toContain("重新查找");expect(discovery).toContain("搜索范围与隐私说明");expect(discovery).toContain("result.failedSources");
});
