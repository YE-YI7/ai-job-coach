import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';

// Build an evidence archive from actual QA receipts, not reconstructed model I/O.
const [dir,recordId,commit,deployment]=process.argv.slice(2);
const base=join(dir,'evidence'),read=name=>JSON.parse(readFileSync(join(base,name+'.json'),'utf8'));
const runs=read('backend-runs'),events=read('backend-events'),final=read('model-1');
assert.equal(final.task.state,'ready');
assert.ok(final.task.result.changes.some(c=>/实习|工作|项目/.test(c.section)),'Do not archive a separator-only result as verified');
assert.equal(read('browser-1/browser-result').passed,true);
const section=(id,label,content,source,availability='retained',format='json')=>({id,label,availability,source,format,content:format==='json'?JSON.stringify(content,null,2):content});
const caseBlocks=runs.filter(row=>row.run.input).map((row,index)=>{
 const run=row.run,traceId=row.legacy_trace_id;
 const raw=run.result?.rawResponse||{},changes=raw.changes||raw.task?.result?.changes||[];
 return {id:'case-'+index,title:row.label,kind:row.status==='failed'?'quality':'input_output',
  summary:`原始状态 ${row.status}；端到端 ${run.durationMs??'未知'} ms。完整模型输入与输出保留在运行 ${row.id}，此处按阶段摘录，不补造历史缺失内容。`,traceIds:traceId?[traceId]:[],changeIds:changes.map(c=>c.id),sections:[
   section('input','本次真实请求输入',run.input,'正常简历 API 的 Eval observer'),
   section('agents','实际 Agent 输出、调用耗时与供应商诊断',run.spans.filter(s=>s.kind==='agent').map(s=>({name:s.name,status:s.status,output:s.output,usage:s.usage,transport:s.transport,durationMs:s.durationMs,inputAvailableAt:`https://yizhioffer.com/admin/evals?run=${row.id}`})),`https://yizhioffer.com/admin/evals?run=${row.id}`,'excerpt'),
   section('delivery','最终业务交付回执与阶段记录',{result:run.result,stages:run.spans.filter(s=>s.kind==='stage').map(s=>({name:s.name,code:s.code,durationMs:s.durationMs,output:s.output}))},'同次请求采集及持久化回读'),
  ]};
});
const files=[0,1].map(i=>{const bytes=readFileSync(join(base,'browser-'+i,'resume-delivery.pdf'));return {id:'actual-pdf-'+i,name:`益职真实改稿验收-${i}.pdf`,base64:bytes.toString('base64'),sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length};});
const finalTrace=final.task.delivery.traceId,changeIds=final.task.result.changes.map(c=>c.id);
const record={schemaVersion:'yizhi.eval-record/v1',id:recordId,title:'空响应与返修超时 · 最终交付验收 · 2026-10-22',kind:'bugfix',status:'verified',
 summary:'修复空正文与截断分类、返修时间预算和已审核候选恢复。真实验收还发现格式指令冲突、无价值分隔符假成功和快速采纳漏报；均保留中间记录，不把上游成功计为业务完成。最终 OCR 经历改稿、保存刷新、实际 PDF 和聊天体验验收通过。',
 tags:['简历改稿','空响应','返修超时','最终交付','真实模型'],versions:['04697ae','1f7108b','e2e9816','1742d0a',commit.slice(0,12)],
 limitations:['所有材料、账号和测试额度均为隔离虚构 QA；没有调用真人连接的 TokenDance 或动旧作答、积分。','本轮新请求的完整 Agent I/O 保存在关联运行页；本记录按块摘录。旧失败 Trace 没有捕获的 finish_reason 不补造。','供应商实际扣费未返回，费用保持未知，不能按0元。少量样本通过不等于全部简历和供应商故障已消失。','实际 PDF 使用 Chrome 原导出窗口及同一打印引擎；没有用第二套模板伪造验收文件。'],
 blocks:[{id:'root-cause',title:'失败根因与有界返修设计',kind:'repair',summary:'不放松事实、责任归属、格式和一次单段体验门槛；没有有效审核结果不得交付。',traceIds:['48e0c423-84ca-4137-ac2d-6e3cd7d57786','badb837e-7d1d-442d-ab19-ddaca716f757','15c0a01d-3c04-4165-a8f5-98980239d9a1'],changeIds:[],sections:[section('design','修复边界','区分只有推理无正文、截断与超时；最多一次显式有界返修；留出整稿检查及提交时间。返修失败仅恢复已经逐条通过事实和价值检查的候选，且恢复稿仍需重新通过整稿检查。格式确定性冲突直接退回编辑，不重复花模型找同一个问题。仅加分隔符不算内容改稿；已过滤候选的部分交付写入任务，刷新不变回完整成功。','当前运行代码与回归测试','retained','text')]},
 ...caseBlocks,
 {id:'save-refresh-pdf',title:'保存、刷新、实际 PDF 与模型选择',kind:'result',summary:'正常 UI 采纳、云端回读与刷新一致；真实导出窗口打印，A4逐页渲染检查；保留紧凑 Logo 模型菜单及选择恢复。',traceIds:[finalTrace],changeIds,sections:[section('browser','最终浏览器验收',{save:read('browser-1/save-refresh'),export:read('browser-1/export'),browser:read('browser-1/browser-result')},'Chrome 实际交互与原导出窗口'),section('chat','讨论不误触编辑，回复逐步显示',read('discussion'),'正常导师 API 的实际 NDJSON 回复')]},
 {id:'delivery-events',title:'最终交付与失败埋点',kind:'result',summary:'尝试、失败、部分交付、完整交付、实际展示、采纳和持久化分开；历史无证据保持未知，不倒填。',traceIds:[finalTrace],changeIds,sections:[section('events','本轮真实埋点',events,'product_events，仅本轮虚构 QA'),section('usage','实际调用与成本边界',read('backend-usage'),'ai_generation_events，仅本轮 QA')]},
 {id:'release',title:'上线构建与数据保护',kind:'release',summary:'同一候选验收通过后晋级；原正式和上一稳定构建保留。',traceIds:[finalTrace],changeIds,sections:[section('build','候选构建标识',{commit,deployment,tests:2771,failures:0,originalSkipped:10},'GitHub Actions 与 Vercel Production 候选'),section('protected','受保护数据',read('protected'),'测试前后排序摘要核对')]}],attachments:files};
const payload=JSON.stringify(record);assert.ok(Buffer.byteLength(payload)<800000,'Archive exceeds the existing admin API limit');
writeFileSync(join(base,'eval-record.json'),payload,{mode:0o600});console.log(JSON.stringify({recordId,bytes:Buffer.byteLength(payload),blocks:record.blocks.length,pdfs:files.map(x=>({name:x.name,sha256:x.sha256,bytes:x.bytes}))}));
