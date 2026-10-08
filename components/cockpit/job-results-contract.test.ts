import fs from "node:fs";
import path from "node:path";
// 静态UI契约，不替代真实浏览器验收。
const source=fs.readFileSync(path.join(process.cwd(),"components/cockpit/JobResultCard.tsx"),"utf8");
const discovery=fs.readFileSync(path.join(process.cwd(),"components/cockpit/JobDiscovery.tsx"),"utf8");
test("卡片保留岗位、地点、出处；依据与风险各一条，主操作是判断是否值得投",()=>{
 expect(source).toContain("{job.title}");expect(source).toContain("{job.company}");expect(source).toContain("job.location");expect(source).toContain("job.url");expect(source).toContain("看看是否值得投");expect(source).toContain("查看招聘原文");expect(source).toContain("disabled={disabled}");expect(source).toContain("onClick={onImport}");expect(source).toContain("<details");expect(source).not.toMatch(/<details[^>]+\bopen\b/);expect(source).toContain("companyLogo(job.company)");expect(source).toContain("<Image");expect(source).not.toContain("Building2");
 // PRD A2/A3：两态、一条依据、一条最影响决定的风险，全部来自服务端契约而不是字符串前缀
 expect(source).toContain("值得进一步了解");expect(source).toContain("先核实条件");
 expect(source).toContain("review.fitReason");expect(source).toContain("review.decisionRisk");
 expect(source).not.toContain('reasons.find(reason=>reason.startsWith');
});
test("决定行只认三种立场，且这条决定不会被写成永久偏好",()=>{
 expect(source).toContain("JOB_DECISION_ORDER.map");expect(source).toContain("onDecide(kind");
 expect(source).toContain("不会标成已投递");
 // 长期偏好（档位）唯一的写入口是面板点选；决定接口不能顺带改它
 expect((discovery.match(/tier-preference/g)||[]).length).toBe(1);
 expect(discovery).toContain("/api/coach/jobs/decisions");
 expect(discovery).toContain("batchRunId: batch.runId");expect(discovery).toContain("materialsVersion: batch.materialsVersion");
});
test("首屏分组与零候选文案交给判定模块，界面只挂一个动作",()=>{
 expect(discovery).toContain("groupCandidates(jobs)");
 expect(discovery).toContain("lead.map(renderCard)");expect(discovery).toContain("rest.map(renderCard)");
 expect(discovery).toContain("zeroCandidateState(");expect(discovery).toContain("tierFilterActive: tiers.length > 0");
 expect(discovery).toContain("{emptyState.actionLabel}");
 // 空态里只有一个按钮：三种原因不能同时摆出三条出路
 expect((discovery.match(/discoveryStyles\.emptyAction/g)||[]).length).toBe(1);
 expect(discovery).not.toContain("暂无符合条件的岗位");
});
test("岗位结果直接展示，不重复解释按钮和下一步",()=>{
 const profile=fs.readFileSync(path.join(process.cwd(),"components/cockpit/ProfileWorkspace.tsx"),"utf8");
 for(const copy of ["接下来，选一个岗位推进","基础简历会带入新岗位","为你找国内机会","按已保存的方向和城市筛选","点「看看我适不适合」继续"]){expect(profile+discovery).not.toContain(copy);}
 expect(discovery).toContain("重新查找");expect(discovery).toContain("搜索范围与隐私说明");expect(discovery).toContain("result.failedSources");
});
