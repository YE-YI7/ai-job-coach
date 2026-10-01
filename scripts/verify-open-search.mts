// Actual runtime source probe, synthetic direction only. No customer data or model calls.
import { searchOpenJobs } from "../lib/jobs/open-search";
import { writeFileSync } from "node:fs";
const samples = [{role:"机械工程师",city:"上海"},{role:"会计",city:"杭州"},{role:"AI 产品经理",city:"北京"}];
const report=[];
for(const sample of samples){
 const start=performance.now();const r=await searchOpenJobs([sample.role],sample.city);
 report.push({...sample,ms:Math.round(performance.now()-start),...r});
 console.log(JSON.stringify({role:sample.role,ms:report.at(-1)?.ms,calls:r.calls,companies:[...new Set(r.postings.map(p=>p.company))],failures:r.failures,postings:r.postings.map(p=>({title:p.title,url:p.url,location:p.location}))}));
}
writeFileSync(process.env.OPEN_SEARCH_OUTPUT||"/tmp/yizhi-open-search-live.json",JSON.stringify(report,null,2));
if(report.some(r=>!r.postings.length))process.exitCode=1;
