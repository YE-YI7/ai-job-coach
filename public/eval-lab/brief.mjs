import {traceStory, compactNodes, orderedRows, selectionAfterRefresh, escape as esc, short} from './brief-model.mjs';
import {sanitize} from './core.mjs';
const $ = id => document.getElementById(id);
let rows = [], selected = null, run = null, sequence = 0, busy = false, lastRead = null;
const requested = new URLSearchParams(location.search).get('run');
let followLatest = !requested;
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const clock = value => Number.isFinite(new Date(value).getTime())
  ? new Date(value).toLocaleString('zh-CN',{hour12:false}) : '时间未记录';
const raw = value => esc(JSON.stringify(sanitize(value), null, 2));
async function read(path) {
  const response = await fetch(path,{cache:'no-store',credentials:'same-origin'});
  if (response.status === 401) throw Error('需要管理员登录。已有内容不会被当成新结果。');
  if (response.status === 403) throw Error('当前账号没有管理员权限。');
  const data = await response.json();
  if (!response.ok) throw Error(data.error || '读取失败，请点刷新重试。');
  return data;
}
function sync(message, error = false) {
  $('sync').textContent = message;
  $('sync').dataset.state = error ? 'error' : 'ready';
}
function render() {
  if (!run) return;
  const story = traceStory(run), m = story.metrics;
  $('title').textContent = run.label || '未命名运行';
  $('identity').textContent = `${story.model} · ${clock(run.startedAt || run.createdAt)} · ${selected.slice(0,8)}`;
  const cost = m.conservativeCostCny;
  const ms = m.wallMs ?? run.durationMs;
  $('metrics').innerHTML = [
    [story.nodes.filter(n => n.type === 'author' || n.type === 'hr').length,'次已记录模型调用'],
    [Number.isFinite(ms) ? `${(ms/1000).toFixed(1)}s` : '未记录','请求耗时'],
    [Number.isFinite(cost) ? `¥${cost.toFixed(4)}` : '未记录','保守费用估算，非实扣'],
  ].map(([value,label]) => `<span><strong>${esc(value)}</strong> ${esc(label)}</span>`).join('');
  $('scope').textContent = run.provenance === 'synthetic'
    ? '演示夹具，非真实模型调用。' : run.source === 'workspace'
      ? '已采集的工作区请求。这里只读，不调用模型。'
      : '历史实验记录 · 执行完成不代表质量通过或已上线';
  const human = story.human;
  $('verdict').innerHTML = human ? `<div class="verdict"><h2>这次卡在哪里</h2>
    <p>${esc(short(human.verdict || human.candidateStatus || '已有人工复核，点开查看。',160))}</p>
    <p class="byline">人工复核，独立于 Agent 原始输出</p>
    <details><summary>看判定依据</summary><p>${esc(human.reason || '')}</p><pre>${raw(human)}</pre></details></div>` : '';
  // Preserve the open node while polling; don't move the reader or steal focus.
  const opened = new Set([...document.querySelectorAll('.step details[open]')].map(el => el.dataset.node));
  const signature = JSON.stringify(story.nodes);
  if ($('path').dataset.signature !== signature) {
    $('path').innerHTML = compactNodes(story.nodes).map(node => `<li class="step" data-type="${node.type}" data-status="${esc(node.status || '')}">
      <details data-node="${esc(node.id)}"${opened.has(node.id) ? ' open' : ''}>
        <summary><strong>${esc(node.title)}</strong></summary>
        <div class="evidence">${node.output ? `<div class="prose">${esc(node.output)}</div>` : ''}
          ${(node.tools || []).map(tool => `<details><summary>${esc(tool.title)}</summary>
            ${(tool.files || []).map(file => `<details><summary>${esc(file.name === 'resume-new.md' ? '简历正文'
              : file.name === 'mentor.md' ? '给用户的说明与追问' : file.name === 'notes.md' ? '作者明示的取舍' : file.name)}</summary>
              <div class="prose">${esc(file.text)}</div></details>`).join('')}
            <p>${esc(tool.note || '')}</p><details><summary>查工具参数与返回</summary><pre>${raw(tool.detail)}</pre></details></details>`).join('')}
          ${(node.files || []).map(file => `<details><summary>${esc(file.name === 'resume-new.md' ? '简历正文'
            : file.name === 'mentor.md' ? '给用户的说明与追问' : file.name === 'notes.md' ? '作者明示的取舍' : file.name)}</summary>
            <div class="prose">${esc(file.text)}</div></details>`).join('')}
          <details><summary>查原始输入与回执</summary><pre>${raw(node.detail)}</pre></details>
        </div>
      </details><p class="summary${node.annotation ? ' annotation' : ''}">${esc(node.annotation ||
        (node.tools.length ? node.tools.map(tool => tool.summary).join('；') : node.summary))}</p>
      ${node.note ? `<p class="note">${esc(node.note)}</p>` : ''}</li>`).join('');
    $('path').dataset.signature = signature;
  }
  $('evaluation').innerHTML = `<details><summary>评测、说明与未测项（和执行过程分开）</summary>
    <p>${story.isHrOnly ? '这次只调用 HR；作者返修、保存刷新和 PDF 均未执行。' : '未捕获的保存 / PDF 回执不能视为通过。'}</p>
    <p>HR 点评、额外 Judge、人工复核分别显示；任何一种都不能冒充作者成稿。</p>
    ${story.judge.length || run.evaluation ? `<pre>${raw({calls:story.judge,result:run.evaluation})}</pre>`
      : '<p>本轮没有单独记录额外的 LLM Judge。</p>'}
    ${run.presentationNote ? `<p>${esc(run.presentationNote)}</p>` : ''}</details>`;
  $('full').href = `./index.html?live=1&run=${encodeURIComponent(selected)}`;
}
function renderRows() {
  $('runs').innerHTML = rows.map(row => `<button type="button" data-run="${esc(row.id)}"
    aria-current="${row.id === selected}">${esc(row.label || row.id)}<small>${esc(clock(row.created_at))} · ${esc(row.id.slice(0,8))}</small></button>`).join('');
  $('runs').querySelectorAll('[data-run]').forEach(button => button.addEventListener('click',() => choose(button.dataset.run)));
  $('newest').hidden = !rows[0] || rows[0].id === selected;
}
function clearDisplayedRun(id) {
  run = null;
  $('path').innerHTML = ''; $('verdict').innerHTML = ''; $('evaluation').innerHTML = '';
  $('feedback').innerHTML = '';
  $('title').textContent = '正在读取这条运行…'; $('identity').textContent = id;
  $('metrics').innerHTML = '';
}
async function choose(id, latest = false) {
  followLatest = latest;
  selected = id; sequence += 1; run = null;
  clearDisplayedRun(id); $('picker').open = false;
  const url = new URL(location.href);
  if (followLatest) url.searchParams.delete('run'); else url.searchParams.set('run',id);
  history.replaceState(null,'',url);
  renderRows(); await refresh(true);
}
async function refresh(force = false) {
  if (busy && !force) return;
  const token = ++sequence, target = selected;
  busy = true; $('refresh').disabled = true;
  try {
    const data = await read('/api/admin/eval-runs?limit=30');
    if (token !== sequence) return;
    rows = orderedRows(data);
    selected = selectionAfterRefresh(rows, target, requested, followLatest);
    if (run && selected !== target) clearDisplayedRun(selected);
    renderRows();
    if (!selected) { sync('没有已留存运行。这里只读，不会自动开始测试。'); return; }
    if (!uuid.test(selected)) throw Error('运行编号无效，没有改用其他运行代替。');
    const detail = await read(`/api/admin/eval-runs?id=${encodeURIComponent(selected)}`);
    if (token !== sequence) return;
    const found = detail.runs?.[0];
    if (!found) throw Error('这条记录缺少可读 Trace。没有用其他结果代替。');
    run = {...found,id:selected}; lastRead = Date.now(); render();
    sync(`${followLatest ? '跟随最新' : '固定本次'} · ${data.localArchive ? '本机证据' : '正式后台'} · ${clock(lastRead)} 已核对`);
    void readFeedback(selected, token);
  } catch (error) {
    if (token === sequence) sync(`更新失败：${error.message}${lastRead ? ` 上次成功：${clock(lastRead)}` : ''}`,true);
  } finally { if (token === sequence) { busy = false; $('refresh').disabled = false; } }
}
async function readFeedback(id, token) {
  try {
    const data = await read(`/api/admin/eval-feedback?runId=${encodeURIComponent(id)}`);
    if (token !== sequence || id !== selected) return;
    const cases = Array.isArray(data.cases) ? data.cases : [];
    $('feedback').innerHTML = cases.length ? `<details><summary>人工反馈 · ${cases.length} 条</summary>
      ${cases.map(item => `<article><p>${esc(short(item.note,160))}</p>
        <details><summary>看原始反馈</summary><pre>${raw(item)}</pre></details></article>`).join('')}</details>` : '';
  } catch {
    if (token === sequence && id === selected)
      $('feedback').innerHTML = '<p class="hint">人工反馈暂未读取成功，可点刷新重试；不影响上面的 Agent 原始记录。</p>';
  }
}
$('refresh').addEventListener('click',() => refresh());
$('newest').addEventListener('click',() => rows[0] && choose(rows[0].id,true));
document.addEventListener('visibilitychange',() => { if (!document.hidden) void refresh(); });
window.addEventListener('focus',() => refresh());
setInterval(() => { if (!document.hidden) void refresh(); },15000);
void refresh();
