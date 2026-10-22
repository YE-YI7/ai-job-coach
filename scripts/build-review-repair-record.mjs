import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
export function buildReviewRepairRecord(){
 const traces=read('docs/operations/2026-10-22-review-repair-qa-traces.json').traces;
 const events=read('docs/operations/2026-10-22-review-repair-model-events.json').events;
 const source='2026-10-22 真实验收留存记录（非模型请求全文）';
 const section=(id,label,availability,content,origin=source,format='text')=>({id,label,availability,source:origin,format,content});
 const product='陈知远（虚构验收材料）\n求职方向：产品助理\n教育经历\n示例大学 信息管理 本科 2022.09-2026.06\n实习经历\n2025.01-2025.03 虚构软件公司 产品实习\n• 参与客服工单需求梳理，阅读并按问题类型整理 40 条历史工单，用 Excel 汇总为需求清单，交给负责页面的同事讨论；该清单用于确定原型中需要补充的提示信息。这让我具备了很强的产品思维、沟通能力和认真负责的工作态度。\n\n2025.04-2025.06 虚构实验室 课程实习\n• 按课程要求记录实验步骤，整理成实验记录表。\n技能\nExcel';
 const retail='陈知远（虚构验收材料）\n求职方向：运营助理\n教育经历\n示例大学 信息管理 本科 2022.09-2026.06\n实习经历\n2025.01-2025.03 虚构门店 运营实习\n• 协助店长做退货记录整理工作，逐单核对退货原因，用 Excel 把同类原因归类并形成分类表，交给店长每周查看和讨论。我认为这锻炼了严谨细致的习惯和团队协作能力。\n• 参与门店活动，具体个人交付还没梳理。\n\n2025.04-2025.06 虚构实验室 课程实习\n• 按课程要求记录实验步骤，整理成实验记录表。\n技能\nExcel';
 const productOutput='• 参与客服工单需求梳理，阅读并按问题类型整理 40 条历史工单，用 Excel 汇总为需求清单\n• 将需求清单交给负责页面的同事讨论，用于确定原型需补充的提示信息';
 const configs=[
  {index:4,id:'final-product',title:'最终版 · 完整事实样本',version:'0edf9ff',task:'resume-task:8d43899c-486f-48f6-b9de-f2910b865004:',input:product,output:productOutput,changeIds:['ai-change-1792655533037-0'],summary:'独立质检通过、1 条修改保存；长句拆为动作与交付用途两条，删去空泛自评。浏览器实点采纳并刷新恢复。'},
  {index:3,id:'final-retail',title:'最终版 · 带信息缺口样本',version:'0edf9ff',task:'resume-task:3fbafad8-6b77-4790-a292-7933e5c24dc8:4',input:retail,output:null,changeIds:[],summary:'86.735 秒完成，1 条安全修改保存；模糊活动条目被事实门禁挡住，不能阻断其他修改。导师只追问一个实际动作。改后完整正文和修改 ID 未独立留存，不能补造。'},
  {index:2,id:'blocked-review',title:'中间版 · 质检协议仍失败',version:'1e263d2',task:'resume-task:3fbafad8-6b77-4790-a292-7933e5c24dc8:2',input:retail,output:null,changeIds:[],kind:'quality',summary:'94.764 秒后被拦截。编辑一次，质检加一次协议补全，均返回嵌套整稿结论无效；未交付、退回预留。上游请求成功，不是网络超时证据。'},
  {index:1,id:'intermediate-product',title:'中间版 · 成功稿与实际 PDF 来源',version:'1e263d2',task:'resume-task:3ec1b2e2-a45d-4355-a3d5-84d8eb7e2296:2',input:product,output:productOutput.replace('• 将需求清单交给','• 需求清单交给'),changeIds:[],summary:'66.826 秒完成，1 条安全修改保存。实际 Chrome 采纳、刷新、导出并由本人保存的 PDF 对应此样本；当时修改 ID 未在独立证据中留存。'},
  {index:0,id:'diagnostic-product',title:'诊断版 · 单经历免费范围样本',version:'7a91a8f',task:'resume-task:64fb757d-7c19-4195-9a47-245f797b3a84:3',input:product,output:null,changeIds:[],summary:'53.108 秒完成、1 条修改保存；本次只授权编辑第一段产品实习，不是整份免费。未留存改后完整正文和修改 ID。'},
 ];
 const caseBlocks=configs.map(c=>{
  const trace=traces[c.index];
  const calls=events.filter(e=>e.request_id.startsWith(c.task));
  return {id:c.id,title:c.title,kind:c.kind||'input_output',summary:`${c.version} · ${trace.outcome} · ${(trace.elapsedMs/1000).toFixed(3)} 秒\n${c.summary}`,traceIds:[trace.traceId],changeIds:c.changeIds,sections:[
   section('input','测试输入（不等于完整模型请求）','fixture',c.input,'隔离虚构测试夹具；由本次验收所用 helper 的已留存定义归档'),
   section('output','改后文字',c.output?'excerpt':'missing',c.output,c.output?'验收时回读的真实修改片段 / 实际 PDF':'没有留存完整候选；只保留 Trace 的完成/失败/修改条数'),
   section('raw-io','模型请求与原始回复','missing',null,'QA 当时未启用完整 Eval observer；不会用夹具或摘要填充原始 I/O'),
   section('knowledge','实际采用知识','metadata',trace.retrieval.documentTitles.map(k=>`${k.title}\n${k.id}`).join('\n\n'),'Trace.retrieval.documentTitles'),
   section('stages','真实处理阶段与质检原因码','metadata',JSON.stringify(trace,null,2),'真实 product_events Trace 元数据，清理 QA 前留存','json'),
   section('calls','模型调用、耗时与 token','metadata',JSON.stringify(calls,null,2),'真实 ai_generation_events；费用估计 null 表示未知，不是零元','json'),
  ]};
 });
 return {schemaVersion:'yizhi.eval-record/v1',id:'f1ca9092-09a4-4ed5-8d4b-29ab58c2d32f',title:'简历质检返修闭环 · 真实验收与上线',summary:'从质检误派返修、嵌套契约失败，到最终两类样本交付、保存刷新和实际 PDF。含 5 次真实生成尝试的元数据、已留存输入与修改摘录。原始模型请求/回复未捕获的部分明确留空。',kind:'bugfix',status:'verified',tags:['简历改稿','质检','返修','保存刷新','PDF'],versions:['7a91a8f','1e263d2','0edf9ff'],limitations:[
  '本记录是事后证据归档，不是运行当时完整采集的 Agent I/O。没有原始请求或回复的内容标为未捕获；不重建隐藏思维链、不伪造修改 ID。',
  '输出摘录只覆盖确实留存的片段。门店样本有真实成功状态、检查和保存证明，但完整改后正文与修改 ID 未留存；中间版的具体嵌套字段错误也未捕获。',
  '实际 PDF 来自 1e263d2 的成功生成与采纳；最终 0edf9ff 仅改质检后端/测试，导出和打印源码相同。两种证据分别标明，不能当作最终 Trace 的逐字导出。',
 ],blocks:[
  {id:'failure-cause',title:'质检失败原因与证据边界',kind:'quality',summary:'质检输出协议异常被当成正文质量缺陷，触发编辑重新生成已有事实支撑的稿件，返修候选又被事实门禁挡住。',traceIds:['a8d9327d-0357-4af5-ad60-80c1804c8503','1c077627-f9bd-4cd7-bb98-3f50202c6596'],changeIds:[],sections:[
   section('evidence','已观察事实','metadata','前轮 a8d9327d：grounding 保留 1 条，整稿 findings=0，逐条 useful=1，却进入一次编辑返修；返修候选 claim_validation 被拒。\n中间版 1c077627：两次 review_document_invalid，未再次派编辑。\n当时 useful=0 是尚未计算就写成零的诊断 bug，不是 LLM 认为修改无价值。','前轮/本轮 Trace 与对应版本控制流'),
   section('interpretation','原因判断与限制','metadata','控制流和元数据把前轮错误定位到 reviewer 顶层结论未满足 passed、又没有可归因 finding 的协议异常。原始 status 字符串缺失，不能声称知道是 missing、invalid 还是 failed。\n中间版能证明整稿嵌套契约无效，不能证明具体哪个字段；提示中的 null、recovery 层级和不完整示例存在含糊，最终版统一输出契约并加精确原因码。','代码核对与验收诊断；推断层级已标明'),
   section('original-review','失败时原始质检输入输出','missing',null,'当时未捕获，历史不可补写'),
  ]},
  caseBlocks[2],
  {id:'repair-process',title:'返修过程与机制变更',kind:'repair',summary:'正文返修和质检协议补全分开处理，均有上限；不放松事实门禁。',traceIds:traces.map(t=>t.traceId),changeIds:['ai-change-1792655533037-0'],sections:[
   section('protocol','质检协议自修','retained','1e263d2：锁住同一候选、来源和修改 ID，协议异常最多向质检员补问一次，不重跑编辑。仍无效则 503 resume_review_unavailable、退回预留。\n0edf9ff：统一完整契约；JSON null 与顶层 recovery 明确分离，新增具体字段原因与修复提示；未计算的 useful 改为 null。','7a91a8f / 1e263d2 / 0edf9ff 提交源码'),
   section('editor','真正正文问题退回原编辑','retained','仅本轮引入的正文/格式错误按真实 changeId 返回原编辑一次；整稿问题用 JSON null。原来缺事实记 warning 并逐问，不因无数字阻止其他安全修改。\n确定性回归覆盖编辑→质检→原编辑返修→质检、协议仍无效、ID/格式越权等。该成功返修流程由回归测试证明，不冒充本轮发生过的真实模型 I/O。','最终干净归档 15 套 203 项回归 / 类型 / 构建'),
  ]},
  caseBlocks[0],caseBlocks[1],caseBlocks[3],caseBlocks[4],
  {id:'save-refresh-pdf',title:'保存、刷新与实际 PDF',kind:'result',summary:'AI 修改真实采纳后保存与刷新恢复；实际 Chrome 保存的一页 A4 PDF 已检查文字与排版，可在本页下载。',traceIds:['35dd0cb8-4b27-40ba-a6a1-54469ed4f03b','19a95677-4304-4d3f-9ec0-51d3a704dff9'],changeIds:['ai-change-1792655533037-0'],sections:[
   section('persistence','最终稿保存刷新','retained','最终候选真实点击“采纳这处修改”，后台机会记录中修改 ai-change-1792655533037-0 为 accepted；刷新后两条 bullet 与另一段原有 bullet 保留。原始 resumeText 没有覆盖。正式域名正常登录隔离 QA 后回读同一 Trace、代次和讨论。','Chrome 实际交互 + 后台只读回读'),
   section('pdf','实际文件验收','retained','PDF：49135 bytes，SHA-256 98c4b3c38f98fc8867e4106831f68d2adb47b175c4c3c4b31159d42a541d4e44。\n一页 A4（594.96×841.92 pt），Tagged、未加密、无 JavaScript。pypdf 提取文字、Poppler 渲染目视：日期、3 个 bullet、末尾技能完整，无裁切/乱码/空页/浏览器页眉页脚。来源为 1e263d2 Trace 19a95677，不是最终 Trace 的逐字副本。','本人在 Chrome 真实保存文件；本页 PDF 附件为原文件副本'),
  ]},
  {id:'mentor-dialogue',title:'导师逐问与聊天体验',kind:'result',summary:'补问不阻止已有安全修改，讨论不误触编辑；模型选择、气泡和逐步回复保留。',traceIds:['dc977099-3a1b-49cc-bb81-d14315f865e5','35dd0cb8-4b27-40ba-a6a1-54469ed4f03b'],changeIds:[],sections:[
   section('skip','带缺口样本的真实对话摘录','excerpt','导师：这段经历里，你本人实际做的第一件事是什么？\n测试输入：记不清了\n实际返回：没关系，记不清可以跳过。我们先处理已有事实支撑的部分：把虚构门店运营实习第一条末尾的空泛评价删掉，保留你实际做的动作和交付。\ndecision=discuss；skipped=1；已保存变化不变。','正常 resume-agent API 真实响应，非构造模型回复'),
   section('discussion','最终稿讨论验证','excerpt','测试输入：先别改。请分两点解释这次修改，最后只问一个必要问题。\n实际回复说明删除空泛自评、拆分动作和交付用途，再只追问后续评审/跟进信息。仅 conversation 调用，没有额外 draft/review；刷新后讨论记录恢复。\n“其他辅导”输入区左下 Logo 紧凑模型菜单可选，实惠档选择刷新恢复。','Chrome 实际交互 + 14 次调用明细；此处为验收摘录，不是回复全文'),
  ]},
  {id:'release',title:'上线结果与数据保护',kind:'release',summary:'同一已验收 Production 构建已发布；旧作答、原资料和积分未变。',traceIds:['35dd0cb8-4b27-40ba-a6a1-54469ed4f03b','dc977099-3a1b-49cc-bb81-d14315f865e5'],changeIds:[],sections:[
   section('deployment','实际发布','retained','0edf9ff / dpl_JAMTV6ieWpFwvtuTUjn6NWcVZq96，干净归档构建后同构建 promote；正式域名 yizhioffer.com 回读 READY。health 200/database ok，简历 Agent 与 Eval API 匿名 401。203 项回归和 138 路由构建通过。原正式与上一稳定构建未删。','Vercel 及正式域名实际回读'),
   section('metrics','耗时与成本口径','metadata',JSON.stringify({calls:14,provider:'stepfun',model:'step-3.7-flash',inputTokens:66528,outputTokens:35312,retries:0,estimatedCostUsd:null,note:'5 次生成尝试中 4 成功、1 中间版被拦，另 3 次讨论；费用未知不按零元。最终候选两类样本通过不等于大样本可靠性证明。'},null,2),'ai_generation_events 留存统计','json'),
   section('protection','旧数据与临时 QA','retained','清理前后 41 旧作答、36 原机会、8 原简历任务正文/答案/讨论/result、钱包 1/转入 1/预留 6 的排序 JSONB MD5 全同。\n仅清本轮虚构 QA 和临时邀请码/会话文件；邀请码实际返回 400，私有目录不存在。本记录另行归档，未恢复已清理 QA 身份、额度或凭据。\n未调用本人 TokenDance、不发短信、不充值或兑换，目录由本人处理。','只读保护快照与精确 QA 清理回执'),
  ]},
 ],attachments:[{id:'actual-pdf',name:'益职返修验收-实际Chrome导出.pdf',base64:fs.readFileSync(path.join(root,'.impeccable/review/review-repair-20261022/actual-chrome-export.pdf')).toString('base64')}]};
}
if(process.argv.includes('--stdout'))process.stdout.write(JSON.stringify(buildReviewRepairRecord()));
