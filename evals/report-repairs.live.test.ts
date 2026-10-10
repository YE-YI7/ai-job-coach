import {callLLM} from "@/lib/llm";
import {RESUME_GROUNDING_PROMPT,renderGroundedResume} from "@/lib/coach-harness/resume-grounding";
// Synthetic material only; opt-in uses the site provider, never a user's wallet.
const live=process.env.RUN_REPORT_LIVE_EVAL==="1"?test:test.skip;
live("hosted model delivers two sourced resume bullets for the report persona",async()=>{
 const text="参与企业权限灰度上线。团队留存提升7个百分点。\n负责审批流程需求梳理。审批完成率从68%提升至81%，属于团队共同成果。\n没有AI或大模型项目交付经验。";
 const result=await callLLM([{role:"system",content:RESUME_GROUNDING_PROMPT},{role:"user",content:`请基于来源输出两条简历bullet。来源ID：resume-text\n${text}`}],{provider:"deepseek",responseFormat:"json_object",temperature:0,maxTokens:1800,reasoningBudgetTokens:2048,timeoutMs:45000,maxRetries:0});
 const parsed=JSON.parse(result.replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,""));
 expect(parsed.bullets).toHaveLength(2);
 const rendered=renderGroundedResume(result,[{id:"resume-text",text}]);
 expect(rendered).toContain("改写后");expect(rendered).not.toMatch(/主导.*权限|交付.*大模型/);
},60000);
