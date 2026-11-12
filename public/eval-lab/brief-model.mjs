// A read-only projection of captured evidence, never a model judge or workflow.
export const list = value => Array.isArray(value) ? value : [];
export const parse = value => {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
};
export const escape = value => String(value ?? '').replace(/[&<>"']/g,
  char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export const short = (value, length = 100) => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length > length ? text.slice(0, length) + '…' : text;
};
const names = {
  read_file:'读取材料', write_file:'写入文档', search:'搜索网页', fetch:'读取网页',
  web_search:'搜索网页', knowledge_read:'读取方法 / 案例', knowledge_search:'查找知识',
  context_load:'读取记忆', memory_find:'查找记忆', submit_edit:'提交修改', compose:'保存候选稿',
  write_output:'写出正文与说明',
};
function calls(output) {
  return list(output?.tool_calls).map(call => ({
    id:call.id, name:call.function?.name || call.name || '未命名工具',
    args:parse(call.function?.arguments ?? call.arguments),
  }));
}
function messages(span) { return list(parse(span.input)?.messages); }
function reason(span) {
  const output = parse(span.output);
  // Only explicit, retained decision summaries. No reconstruction of hidden reasoning.
  return output?.notes || output?.editorialPlan?.mainline || output?.reason || '';
}
function toolReceipt(spans, call) {
  for (const span of spans) {
    if (call.id && parse(span.input)?.toolCallId === call.id) return parse(span.output);
    for (const message of messages(span)) {
      if (call.id && message.role === 'tool' && message.tool_call_id === call.id)
        return parse(message.content);
    }
  }
  return null;
}
function isJudge(span) {
  return span.role === 'eval_judge' || span.agent === 'LLM 自评';
}
function isHr(span) { return /\bHR\b|独立.*审|独立.*复核/i.test(`${span.agent} ${span.name}`); }
function modelOutput(span) {
  const output = parse(span.output);
  if (typeof output === 'string') return output;
  return output?.content || output?.message || '';
}
export function traceStory(run) {
  const spans = list(run.spans);
  const actual = spans.filter(span => span.kind !== 'stage' && !isJudge(span));
  const nodes = [{id:'input', type:'input', title:'这次交给了 AI 什么',
    summary:actual.length ? '本轮输入已留存，点开看材料来源。' : '尚未采集完整输入。',
    detail:run.input ?? actual[0]?.input ?? null}];
  let author = 0;
  const allTools = [];
  for (const [index, span] of actual.entries()) {
    const output = parse(span.output), tools = calls(output), hr = isHr(span);
    if (!hr) author += 1;
    const explicit = reason(span);
    nodes.push({id:span.id || `call-${index}`, type:hr ? 'hr' : 'author',
      title:hr ? 'HR 看这份稿' : author === 1 ? '作者判断怎么改' : '作者继续处理',
      summary:short(explicit) || (tools.length
        ? `选了${tools.map(tool => names[tool.name] || tool.name).join('、')}。`
        : hr ? '已返回点评；是否判断正确，另看人工复核。' : '已返回结果，未单独留存判断摘要。'),
      model:span.servedModel || span.model, durationMs:span.durationMs,
      detail:{input:span.input, output:span.output}, output:modelOutput(span),
      annotation:run.traceNotes?.[span.id] || null,
      decisionRecorded:Boolean(explicit), status:span.status});
    const toolStart = nodes.length;
    for (const [i, tool] of tools.entries()) {
      const args = tool.args || {}, receipt = toolReceipt(spans, tool);
      const target = args.query || args.path || args.file || args.url || args.id || '';
      const fileLabels = {'resume.md':'当前上传的简历', 'facts.md':'已有经历事实',
        'jd.txt':'岗位要求', 'spec.md':'改稿规格', 'candidate.md':'候选正文',
        'mentor.md':'给用户的说明', 'notes.md':'作者的显式判断记录'};
      const document = args.content ?? args.text;
      const files = list(args.files).filter(file => typeof file.text === 'string');
      const error = receipt?.error || receipt?.code;
      allTools.push(tool.name);
      nodes.push({id:`tool-${index}-${i}`, type:'tool', title:names[tool.name] || tool.name,
        summary:files.length ? files.map(file => ({'resume-new.md':'简历正文',
          'notes.md':'取舍说明','mentor.md':'用户追问'}[file.name] || file.name)).join('、')
          : fileLabels[target] || short(target, 85) || '参数已留存',
        note:error ? `工具回执：${typeof error === 'string' ? error : '失败'}`
          : receipt ? '有返回记录；读到不等于用进成稿。' : '没有单独留存返回回执。',
        detail:{arguments:tool.args, receipt},
        output:typeof document === 'string' ? document : '', files,
        status:error ? 'failed' : 'recorded'});
    }
    if (tools.length > 1) {
      const batch = nodes.splice(toolStart);
      nodes.push({id:`tools-${index}`,type:'tool',title:`一次选择 ${batch.length} 个工具动作`,
        summary:batch.map(node => node.summary).join('、'),
        note:'同一次模型响应中的动作，合并展示；不是预设调用顺序。',
        detail:batch.map(node => ({action:node.title,...node.detail})),
        files:batch.flatMap(node => node.files || []),status:batch.some(node => node.status === 'failed') ? 'failed' : 'recorded'});
    }
  }
  const delivery = run.delivery || run.result?.rawResponse?.delivery;
  nodes.push({id:'delivery', type:'delivery', title:'最后交付了什么',
    summary:delivery ? `交付：${delivery.outcome || '状态未记录'}；保存：${delivery.persistence || '未记录'}`
      : actual.length && actual.every(isHr) ? '本轮只测 HR，没有重写、保存或导出简历。'
        : '执行结束；保存与 PDF 以各自回执为准。', detail:run.result ?? null});
  return {nodes, tools:allTools, judge:spans.filter(isJudge),
    human:run.manualSourceAudit ?? run.result?.rawResponse?.humanReview ?? null,
    model:run.model || actual.find(span => span.model)?.model || '未记录',
    metrics:run.metrics || {}, isHrOnly:actual.length > 0 && actual.every(isHr)};
}
export function orderedRows(data) {
  return list(data.captured).slice().sort((a,b) =>
    (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0));
}
export function compactNodes(nodes) {
  const result = [];
  for (const node of nodes) {
    const previous = result.at(-1);
    if (node.type === 'tool' && previous && previous.type === 'author') {
      previous.tools.push(node);
      if (node.files?.length) previous.title = result.filter(item => item.tools?.some(tool => tool.files?.length)).length > 1
        ? '根据点评返修' : '形成首稿';
      else previous.title = '读取材料';
    } else result.push({...node,tools:[]});
  }
  return result;
}
export function selectionAfterRefresh(rows, current, requested, followLatest = false) {
  if (followLatest && rows[0]) return rows[0].id;
  // An explicitly opened historical run is never silently replaced by the latest.
  return current || requested || rows[0]?.id || null;
}
