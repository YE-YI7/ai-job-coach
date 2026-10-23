import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';

// Offline diagnostic only. Does not call a model, database, quota or user API.
// Input: retained synthetic acceptance evidence; output: a new Eval record.
const [directory, recordId, measuredAt] = process.argv.slice(2);
assert.ok(directory && recordId && measuredAt, 'Provide evidence directory, new record UUID, capture timestamp');
const read = name => JSON.parse(readFileSync(join(directory, name + '.json'), 'utf8'));
const runs = read('backend-runs');
const cases = [
  ['965ed80d-518f-4c9d-957e-220afcb70cc5', 'A 列表稿', '1f7108b', 'model-0', 'accepted'],
  ['63c83f28-8f53-4280-b264-86bc165b6ce4', 'B 返修超时', '1f7108b', 'model-1-before-v9', 'failed'],
  ['c102dcae-b3d6-4bc2-b7b8-7e015840a768', 'B 只改分隔符', 'e2e9816', 'model-1-separator-rejected', 'product_rejected'],
  ['d7c7b84c-cc9b-4a93-a8ab-b1535d69e8ea', 'B 最终经历改稿', '39c37f0', 'model-1', 'accepted_partial'],
];
const sha = value => createHash('sha256').update(value).digest('hex');
const metrics = cases.map(([id, name, version, file, acceptance]) => {
  const row = runs.find(r => r.id === id); assert.ok(row);
  const agents = row.run.spans.filter(s => s.kind === 'agent');
  const sum = selector => agents.reduce((n, s) => n + (selector(s) || 0), 0);
  const wallMs = read(file).durationMs;
  assert.ok(wallMs >= sum(s => s.transport.elapsedMs));
  const inputTokens = sum(s => s.usage?.inputTokens), outputTokens = sum(s => s.usage?.outputTokens);
  // Current official CN list price, not a supplier invoice. Unknown cache hits
  // give an all-hit to all-miss reference range, not a claim of zero cache hits.
  const referenceCny = {
    min: (inputTokens * 0.27 + outputTokens * 8.1) / 1e6,
    max: (inputTokens * 1.35 + outputTokens * 8.1) / 1e6,
    actualBill: null,
  };
  return {id, name, version, acceptance, traceId: row.legacy_trace_id,
    startedAt: row.run.startedAt, inputSha256: sha(row.run.input.resume), wallMs,
    nativeRunMs: row.run.durationMs, transportEnvelopeMs: sum(s => s.transport.elapsedMs),
    agentSpanMs: sum(s => s.durationMs), calls: agents.length,
    inputTokens, outputTokens, referenceCny,
    agents: agents.map((s, i) => ({order: i + 1, name: s.name, status: s.status,
      spanMs: s.durationMs, transport: s.transport, usage: s.usage,
      inputCharacters: s.input.messages.reduce((n, m) => n + m.content.length, 0),
      outputCharacters: typeof s.output === 'string' ? s.output.length : null})),
  };
});
assert.equal(new Set(metrics.slice(1).map(r => r.inputSha256)).size, 1, 'B source text must be identical');
assert.equal(metrics[3].calls, 4); assert.equal(metrics[3].inputTokens, 22293); assert.equal(metrics[3].outputTokens, 17704);
assert.equal(metrics[3].transportEnvelopeMs, 141180);
const finalRun = runs.find(r => r.id === metrics[3].id);
const reviews = finalRun.run.spans.filter(s => s.kind === 'agent' && s.name === '独立质检 Agent');
const first = JSON.parse(reviews[0].output), second = JSON.parse(reviews[1].output);
assert.equal(first.status, 'failed'); assert.equal(second.status, 'passed');
const candidate = messages => messages.find(m => m.role === 'user' && m.content.startsWith('{') && m.content.includes('appliedCandidate'))?.content;
assert.equal(candidate(reviews[0].input.messages), candidate(reviews[1].input.messages), 'Do not describe different candidates as verdict drift');
assert.ok(!reviews[1].input.messages.some(m => m.content.includes(reviews[0].output)), 'Check whether the first verdict was passed to the contract repair');

// Fresh read-only ai_generation_events query: scoped to this exact generation.
// latency_ms is recorded before the telemetry insert; transport.elapsedMs is
// recorded after it. Never call the latter pure upstream inference latency.
const perCall = [
  {phase:'初稿', suffix:'', latencyMs:42251, inputTokens:5397, outputTokens:4850},
  {phase:'第一次独立质检', suffix:':review', latencyMs:41409, inputTokens:5871, outputTokens:5560},
  {phase:'质检协议补全', suffix:':review:contract-repair', latencyMs:30073, inputTokens:5949, outputTokens:3835},
  {phase:'过滤后的最终整稿复核', suffix:':retained-document', latencyMs:25525, inputTokens:5076, outputTokens:3459},
];
for (const [i, call] of perCall.entries()) {
  assert.equal(call.inputTokens, metrics[3].agents[i].usage.inputTokens);
  assert.equal(call.outputTokens, metrics[3].agents[i].usage.outputTokens);
  assert.ok(call.latencyMs <= metrics[3].agents[i].transport.elapsedMs);
}
const modelMs = perCall.reduce((n, c) => n + c.latencyMs, 0);
const contextMs = finalRun.run.spans.find(s => s.code === 'own_materials_compiled').durationMs;
const artifactMs = finalRun.run.spans.find(s => s.code === 'artifact_saved').durationMs;
const decomposition = {
  apiWallMs: metrics[3].wallMs,
  modelBeforeTelemetryMs: modelMs,
  modelShare: modelMs / metrics[3].wallMs,
  contextMs, artifactMs,
  otherInsideNativeMs: metrics[3].nativeRunMs - modelMs - contextMs - artifactMs,
  outsideNativeMs: metrics[3].wallMs - metrics[3].nativeRunMs,
  transportTelemetryDifferenceMs: metrics[3].transportEnvelopeMs - modelMs,
  beforeFirstFinalContentSumMs: metrics[3].agents.reduce((n, a) => n + a.transport.firstContentMs, 0),
  residualIsNotPureDbOrNetwork: true,
};
assert.equal(modelMs, 139258);
assert.equal(modelMs + contextMs + artifactMs + decomposition.otherInsideNativeMs + decomposition.outsideNativeMs, metrics[3].wallMs);
const changeIds = read('model-1').task.result.changes.map(c => c.id);
const traces = metrics.map(m => m.traceId);
const sources = [
  {title:'JSON Mode 与 JSON Schema',url:'https://platform.stepfun.com/docs/zh/guides/developer/json-mode',finding:'step-3.7-flash 支持 API 级 strict JSON Schema；结构正确不代表语义或事实正确。'},
  {title:'Step 3.7 Flash',url:'https://platform.stepfun.com/docs/zh/guides/models/step-3.7-flash',finding:'low/medium/high 推理档；当前运行已经设置 low，没有凭据支持宣称可关闭推理。'},
  {title:'Prompt 缓存',url:'https://platform.stepfun.com/docs/zh/guides/developer/prompt-cache',finding:'重复前缀自动缓存；cached_tokens 才是已知命中；不能从本地缺省0推出未命中。'},
  {title:'API 定价',url:'https://platform.stepfun.com/docs/zh/guides/pricing/details',finding:'本次中国站点为人民币参考价：输入未命中1.35/命中0.27、输出8.1元每百万Token，不使用海外美元价冒充实扣。'},
];
const section = (id,label,content,source,availability='retained') => ({id,label,availability,source,format:typeof content==='string'?'text':'json',content:typeof content==='string'?content:JSON.stringify(content,null,2)});
const block = (id,title,kind,summary,sections,traceIds=traces) => ({id,title,kind,summary,sections,traceIds,changeIds:traceIds.includes(metrics[3].traceId)?changeIds:[]});
const record = {
  schemaVersion:'yizhi.eval-record/v1',id:recordId,
  title:'182秒耗时诊断 · 保留质检的优化试验准备 · 2026-10-22',kind:'evaluation',status:'partial',
  summary:'已核对同批虚构样本和正式后台原始记录。最终B的182.183秒包含初稿42.251、首轮质检41.409、协议补全30.073、最终保留稿复核25.525秒，余42.925秒不是纯网络。发现协议补全对未变化稿件重判并由失败变通过，必须防止判断漂移。仅完成诊断和实验设计；未实现提速、未新跑模型、未发布。',
  tags:['耗时诊断','同样本','质量不降级','协议补全','判断漂移','成本边界'],
  versions:['1f7108b','e2e9816','39c37f0'],
  limitations:[
    '原始QA运行UTC 2026-10-23 04:36—04:59；洛杉矶10月22日。只有2份简历，B有3个版本；不是随机配对性能实验，不报告P95或显著提速。',
    '阶段检查点、模型span、调用用量latency和浏览器API墙钟起止不同；必须用不重叠分解，不能全部相加。',
    '近24小时v2交付回执5条均为internal，没有external新记录；不能把QA结果当普通用户总体或宣称零失败。',
    '供应商结算未知、缓存命中未正确捕获；人民币上下界仅为官网单价参考，不是实际扣费，也不是测得的优化后价格。',
    '没有保存私有推理文本；首段最终正文之前的时间包含推理、排队、预填充与网络，无法进一步精确区分。',
    '当前仅诊断，优化后的质量、耗时、成本及新的保存刷新/PDF结果仍未采集；原验收文件不冒称新优化验收。',
  ],
  blocks:[
    block('bottleneck','182秒具体花在哪里','result','四次串行模型调用合计139.258秒，占API墙钟76.44%。协议补全不是原编辑返修，最后复核覆盖过滤后的真实保留稿，不可直接砍掉。',[
      section('timing','最终B不重叠耗时分解',decomposition,'原始Eval spans、API JSON；同代次 ai_generation_events 实时回读'),
      section('calls','四次调用明细',perCall,'ai_generation_events；request_id=resume-task:67960ca2-3535-49ae-86a0-9473644b1e0c:11及精确后缀'),
      section('observations','关键解释','transport.elapsedMs在用量埋点写入之后结束，比模型用量latency合计多1.922秒，故旧“141秒供应商耗时”只是调用封装口径。四次首段最终正文时间合计129.382秒，输出正文后至结束只占较少时间；不能由此断言全是思考或全是网络。','lib/llm.ts实际时钟位置'),
    ],[metrics[3].traceId]),
    block('cases','同批样本、质量与参考成本','input_output','A和B不是同份简历；B输入文本三版hash相同，但版本、提示、调用数和质量结果不同，不能用75秒与182秒宣称提速。116秒的分隔符版本未通过产品验收。',[
      section('metrics','四次改稿实际指标',metrics,'旧真实测试JSON、完整Agent spans；未新调用模型'),
      section('cost','成本解释','最终B已知输入22,293、输出17,704 tokens；按中国官网单价，缓存全命中至全未命中参考约0.1494—0.1735元，实扣未知。约0.1434元来自输出定价项。输出token可能含推理，不等于可见JSON字数；不能靠压总上限冒险清空正文。','中国官方定价与原用量'),
    ]),
    block('contract-drift','协议补全为什么又慢又不稳定','quality','首轮B质检漏了useful=false项目的kind，触发review_value_checks_invalid。补全调用没有收到原质检输出，只收到错误码和原候选，等价于重判；同稿失败变通过，不应作为纯格式修复掩盖。',[
      section('first','原第一次质检最终输出',first,'关联运行第2个模型输出'),
      section('second','协议补全后的最终输出',second,'关联运行第3个模型输出'),
      section('checks','已核对边界',{sameCandidatePayload:true,firstVerdictPassedToRepair:false,firstStatus:first.status,secondStatus:second.status,issue:'review_value_checks_invalid',firstGroundingError:first.document.findings,finalRetainedReview:JSON.parse(reviews[2].output)},'原模型消息逐项比较；没有推理链内容'),
      section('implication','修复方向','不能通过放宽字段要求、忽略先前grounding错误或碰巧重判通过来提速。先试API strict schema以减少协议补全，并将任何补全过程与语义重审分开；补格式必须保留原阻断结论，语义分歧交原编辑返修或明确复核。反例加入同批验收。','当前代码控制流核对'),
    ],[metrics[3].traceId]),
    block('overhead','43秒其余开销：已知与未知','quality','材料编译3.831秒、artifact保存4.647秒；其余含同步Eval采集、任务认领/提交/回读、交付记录及API外层等待。没有每段计时前不能将所有残差归给数据库或跨区。',[
      section('code','实际同步路径','observedResumeLLM在每次模型前后await保存整份Eval run；llm.ts还await用量写入。workspaceEvalEnabled仅管理员/显式采集账号启用，因此QA含额外采集开销，不等于所有用户都承受同样开销。resume-agent在提交回读后又串行记录outcome、Eval关联、document持久化回执。','eval-observer.ts/workspace-eval.ts/resume-agent/route.ts/resume-delivery-record.ts'),
      section('measurement-gap','需补的计时与缓存字段','补request_received/claim/context/model_start/headers/first_reasoning_activity/first_final_content/body_end/usage_write/Eval_write/CAS_commit/readback/receipt_write/response_ready等时钟并保留捕获开关。当前normalizeGenerationUsage漏读Step官方cached_tokens，DB缺省0并非真实未命中证据；先修采集再判断缓存收益。','代码及官方cached_tokens契约'),
    ],[metrics[3].traceId]),
    block('experiment','下一轮同样本对比与发布门','repair','先协议可靠性、后上下文去重/缓存、再观测I/O优化；独立内容质检和最终稿覆盖不删除。每轮单因素，不先换模型。',[
      section('plan','有界试验设计',{
        baseline:'固定39c37f0 + step-3.7-flash + low + 原始2份输入及事实/格式规则；使用新虚构隔离账号，不恢复已删除临时凭据。',
        variants:[
          {id:'B1',change:'严格JSON Schema；必要的协议修复保留原错误，不以重判通过覆盖',holds:'独立逐条价值与最终整稿审查、返修/费用/输出上限不降级'},
          {id:'B2',change:'在B1稳定后，仅去同义重复指令，将不变知识与schema移至稳定前缀，保留事实、例子和审查维度',holds:'同模型、同输入、同预算，单独测冷热缓存'},
          {id:'B3',change:'在已计时I/O基础上，合并不必要重复读取/全量快照写；保证重要失败和I/O最终可靠落库',holds:'CAS、原文保护、最终交付和Eval证据不能丢，不能无保障fire-and-forget'},
        ],
        repetition:'首轮每份样本基线和B1各2次，A/B与B/A交错，共8次显式改稿请求；非自动重试，所有内部模型调用含失败/返修计入。若结果漂移或噪声超差异，再决定是否补第3轮。',
        cost:'优先站点模型、每请求最多约230秒工作流；保守以6次内部调用、每次12000输入+6700输出、8请求估算官网未命中价格约3.39元，非实扣上限；实际预算按确定schema/请求计数重算。任何新增付费服务先告知。',
        measurements:['API端到端与分阶段中位数/范围、逐样本配对差值','成功/失败/部分交付；不能只保留成功样本','事实、责任/阶段边界、编辑价值、格式一致性、无价值改动比例、质检结论稳定性','首轮通过率、协议补全率、返修次数、总模型调用和总token含失败','实际账单若不可得，引用官网价及缓存字段；未知不记0','正常UI保存→刷新同代次→实际PDF文字/排版；Logo模型选择和逐步聊天不回归'],
        gates:'事实/责任/格式硬伤零容忍；质量盲审不得劣于基线，不能以固定100分当质量证据。不得压缩质检维度、低质量只改分隔符不算成功。样本少不报P95或显著性。达到质量/保存/PDF门后，才验候选并晋级同一构建。',
        status:'planned_not_executed',
      },'本次设计；没有新模型调用，不能当试验结果'),
    ]),
    block('sources','官方资料与本轮边界','release','只用阶跃官方接口/模型/缓存/定价资料解释可试选项；不引用排行榜速度替代真实产品链路。只新增这条诊断记录，无运行代码或线上变更。',[
      section('official','已读官方来源',sources,'官方文档，'+measuredAt),
      section('live-check','正式后台元数据核验',{readAt:measuredAt,nativeRuns:5,finalRunId:metrics[3].id,finalRunSpanCount:12,finalRunDurationMs:162132,recent24HourV2:[{cohort:'internal',outcome:'delivered',count:2},{cohort:'internal',outcome:'failed',count:1},{cohort:'internal',outcome:'partial_delivered',count:2}],externalV2Count:0},'Supabase只读SQL；正式后台原记录未修改'),
      section('release','本轮交付边界','诊断完成，优化实现/配对试验/新PDF/新发布均未发生。旧作答、原简历与积分未写入；本轮模型调用0次、无新供应商费用。前一验收记录3ca9d426-ec58-4a0a-b628-36ba68e31cb9保留不覆盖。','本轮执行记录'),
    ]),
  ],attachments:[],
};
const require = createRequire(import.meta.url), ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);
const {parseEvalRecord, recordIndex, recordHash} = require('../lib/coach-harness/eval-records.ts');
const parsed = parseEvalRecord(record); assert.ok(parsed, 'Must satisfy real production record parser');
assert.ok(Buffer.byteLength(JSON.stringify(parsed)) < 800000);
process.stdout.write(JSON.stringify({metrics,decomposition,record:parsed,index:recordIndex(parsed),archiveHash:recordHash(parsed)}));
