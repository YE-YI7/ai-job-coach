'use client';
import {Fragment, useEffect, useMemo, useRef, useState} from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {comparisonDiff, plainResume, type ResumeComparison, type ComparisonColumn, type ComparisonSection}
  from '@/lib/coach-harness/resume-comparison';
import s from './Comparison.module.css';
type Draft = {revision: number; sections: Record<string, string>; savedAt: string};
type Direct = {id: string; status: string; run: {traceId: string; sections: ComparisonSection[];
  decisions: string[]; spans: Array<{durationMs: number; usage?: {inputTokens: number; outputTokens: number; estimatedCostUsd: number}}>}};
type Data = {comparison: ResumeComparison; draft: Draft | null; directRuns: Direct[]};
async function api(path: string, init?: RequestInit) {
  const r = await fetch('/api/admin/resume-comparisons' + path, {...init, cache: 'no-store'});
  const value = await r.json(); if (!r.ok) throw Error(value.error || '请求未完成'); return value;
}
function Diff({before, after, deletions}: {before: string; after: string; deletions: boolean}) {
  const parts = useMemo(() => comparisonDiff(plainResume(before), plainResume(after)), [before, after]);
  return <div className={s.prose}>{parts.map((p, i) => p.kind === 'add' ? <mark key={i}>{p.text}</mark> :
    p.kind === 'delete' ? deletions && <del key={i}>{p.text}</del> : <Fragment key={i}>{p.text}</Fragment>)}</div>;
}
function Sources({column}: {column: ComparisonColumn}) {
  return <div className={s.sources}>
    {column.runIds.map(id => <Link key={id} href={'/admin/evals?run=' + id} target="_blank">完整运行 {id}</Link>)}
    {column.traceIds.map(id => <span key={id}>Trace <code>{id}</code></span>)}
    {column.changeIds.length > 0 && <details><summary>{column.changeIds.length} 个修改 ID</summary>
      {column.changeIds.map(id => <code key={id}>{id}</code>)}</details>}
  </div>;
}
export default function ComparisonClient() {
  const [rows, setRows] = useState<Array<{id: string; label: string}>>([]);
  const [id, setId] = useState(''), [data, setData] = useState<Data | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({}), [revision, setRevision] = useState(0);
  const [dirty, setDirty] = useState(false), [tab, setTab] = useState('resume'), [section, setSection] = useState('all');
  const [deletions, setDeletions] = useState(false), [attempt, setAttempt] = useState('');
  const [busy, setBusy] = useState(false), [calling, setCalling] = useState(false), [confirm, setConfirm] = useState(false);
  const [error, setError] = useState(''), [message, setMessage] = useState('正在读取后台对照…');
  const dirtyRef = useRef(false);
  useEffect(() => {dirtyRef.current = dirty;}, [dirty]);
  useEffect(() => {
    const abort = new AbortController();
    api('', {signal: abort.signal}).then(v => {if (abort.signal.aborted) return;
      setRows(v.comparisons); setId(new URLSearchParams(location.search).get('id') || v.comparisons[0]?.id || '');
      if (!v.comparisons.length) setMessage('暂无对照记录。导入后会在此显示，原简历不会被修改。');
    }).catch(e => {if (!abort.signal.aborted) setError(e.message);});
    return () => abort.abort();
  }, []);
  useEffect(() => {
    if (!id) return;
    const abort = new AbortController();
    api('?id=' + id, {signal: abort.signal}).then((v: Data) => {
      if (abort.signal.aborted) return;
      setData(v); setDraft(v.draft?.sections || Object.fromEntries(v.comparison.columns[0].sections.map(x => [x.id, ''])));
      setRevision(v.draft?.revision || 0); setDirty(false); setAttempt(v.directRuns.at(-1)?.id || ''); setError('');
      setSection(v.comparison.columns[0].sections[0]?.id || 'all');
      setMessage(v.draft ? '已恢复本人手写稿 · ' + new Date(v.draft.savedAt).toLocaleString('zh-CN') : '原始材料与已有输出已读取；手写稿尚未保存');
      const url = new URL(location.href); url.searchParams.set('id', id); history.replaceState(null, '', url);
    }).catch(e => {if (!abort.signal.aborted) setError(e.message);});
    return () => abort.abort();
  }, [id]);
  useEffect(() => {
    const leave = (e: BeforeUnloadEvent) => {if (dirtyRef.current) {e.preventDefault(); e.returnValue = '';}};
    window.addEventListener('beforeunload', leave); return () => window.removeEventListener('beforeunload', leave);
  }, []);
  async function save() {
    setBusy(true); setError(''); setMessage('正在保存本人手写稿…');
    try {const v = await api('', {method: 'PATCH', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({id, revision, sections: draft})});
      setRevision(v.draft.revision); setDirty(false); setMessage('本人手写稿已保存到后台；未写回原简历');
    } catch (e) {setError(e instanceof Error ? e.message : '保存未确认，输入已保留');} finally {setBusy(false);}
  }
  async function direct() {
    if (calling) return; setCalling(true); setConfirm(false); setError(''); setMessage('模型直改中。可以继续编辑手写稿，切勿重复发起。');
    try {
      await api('/direct', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({id, acknowledgeCost: true})});
      const v: Data = await api('?id=' + id); setData(v); setAttempt(v.directRuns.at(-1)?.id || '');
      setMessage('直调结果已留存；请审阅正文与Trace。未运行产品质检。');
    } catch (e) {setError((e instanceof Error ? e.message : '未确认直调结果') + '；请先刷新直调记录核对，避免重复费用。');}
    finally {setCalling(false);}
  }
  async function refreshDirect() {
    try {const v: Data = await api('?id=' + id); setData(v); setAttempt(v.directRuns.at(-1)?.id || '');
      setMessage('直调记录已刷新；未覆盖当前手写输入'); setError('');} catch {setError('直调记录刷新失败；手写输入保留');}
  }
  const selected = data?.directRuns.find(r => r.id === attempt);
  const columns = data?.comparison.columns.map(c => c.id !== 'direct' || !selected ? c : {...c,
    status: selected.status === 'completed' ? '模型已返回 · 未经产品质检' : selected.status === 'running' ? '处理中 · 请勿重复调用' : '直调失败 · 原始Trace保留',
    sections: selected.run.sections.length ? selected.run.sections : c.sections,
    judgments: selected.run.decisions.map(text => ({label: '模型自述取舍', text})),
    traceIds: [selected.run.traceId], runIds: [selected.id],
  });
  const sections = data?.comparison.columns[0].sections.filter(x => section === 'all' || section === x.id) || [];
  return <main className={s.root}>
    <a className={s.skip} href="#comparison">跳到六列对照</a>
    <header className={s.header}><Link href="/admin/evals" className={s.brand}>益职 / <strong>Eval Lab</strong></Link>
      <nav aria-label="后台导航"><Link href="/admin/evals">运行</Link><Link href="/admin/evals/records">开发记录</Link>
        <Link href="/admin/evals/comparisons" aria-current="page">简历对照</Link><Link href="/admin/evals/analytics">数据</Link></nav></header>
    <div className={s.heading}><div><h1>简历六列对照</h1><p>同稿对读、改动高亮、判断与溯源。最后一列只保存为点评副本。</p></div>
      <label>选择案例<select value={id} disabled={dirty || busy || calling} onChange={e => setId(e.target.value)}>
        {rows.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}</select></label></div>
    <p className={error ? s.error : s.status} role={error ? 'alert' : 'status'}>{error || message}{dirty && ' · 有未保存修改'}</p>
    {data && columns && <>
      <details className={s.boundary}><summary>输入与比较边界 · {data.comparison.model}</summary>
        <p>{data.comparison.title}</p><ul>{data.comparison.notes.map(n => <li key={n}>{n}</li>)}</ul>
        <details><summary>本次共用 JD</summary><div className={s.prose}>{data.comparison.input.jd || '未提供 JD，不做匹配评分。'}</div></details>
      </details>
      <div className={s.controls}><div role="tablist" aria-label="对照内容">
        {['resume', 'judgments'].map((t, i) => <button key={t} type="button" role="tab" aria-selected={tab === t}
          tabIndex={tab === t ? 0 : -1} aria-controls="comparison" onClick={() => setTab(t)} onKeyDown={e => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
            e.preventDefault(); const next = e.key === 'Home' ? 0 : e.key === 'End' ? 1 : 1 - i;
            setTab(['resume', 'judgments'][next]);
            (e.currentTarget.parentElement?.children[next] as HTMLButtonElement)?.focus();
          }}>{['简历对照', 'Agent 关键判断'][i]}</button>)}</div>
        <label>查看分段<select value={section} onChange={e => setSection(e.target.value)}><option value="all">全部内容</option>
          {data.comparison.columns[0].sections.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
        <label className={s.check}><input type="checkbox" checked={deletions} onChange={e => setDeletions(e.target.checked)}/>显示删去内容</label>
        <span className={s.legend}><mark>改写 / 新增</mark><del>删除</del></span>
        <button type="button" className={s.save} disabled={!dirty || busy} onClick={save}>{busy ? '保存中…' : '保存我的版本'}</button>
      </div>
      <div className={s.directTools}><span>模型直改：{data.directRuns.length} / 3 次</span>
        {data.directRuns.length > 0 && <label><span className={s.sampleLabel}>直调样本</span>
          <select aria-label="直调样本" value={attempt} onChange={e => setAttempt(e.target.value)}>
            {data.directRuns.map((r, i) => <option key={r.id} value={r.id}>第 {i + 1} 次 · {
              r.status === 'completed' ? '已返回' : r.status === 'running' ? '处理中' : '失败'}</option>)}
          </select></label>}
        <button type="button" onClick={refreshDirect} disabled={calling}>刷新直调记录</button>
        <button type="button" disabled={calling || data.directRuns.length >= 3 || data.directRuns.some(r => r.status === 'running')}
          onClick={() => setConfirm(true)}>{calling ? '模型直改中…' : '运行一次模型直改'}</button>
        {confirm && <span className={s.confirm}>将使用 {data.comparison.model}，产生 TokenDance 费用，不扣益职积分。
          <button type="button" onClick={() => setConfirm(false)}>先不运行</button><button type="button" onClick={direct}>确认运行一次</button></span>}
      </div>
      <p className={s.hint}>五份来源稿只读，黄底标出相对原稿的变化。屏幕较窄时，横向滑动查看六列。</p>
      <div className={s.viewport} id="comparison" role="tabpanel" aria-label={tab === 'resume' ? '六列简历' : '六列判断与Trace'} tabIndex={0}>
        <div className={s.grid}>
          {columns.map(c => <section className={s.columnHead} key={c.id}><h2>{c.label}</h2><p>{c.status}</p></section>)}
          <section className={s.columnHead}><h2>我自己写</h2><p>{dirty ? '未保存' : revision ? `已存后台 · 版本 ${revision}` : '可编辑 · 尚未保存'}</p></section>
          {tab === 'judgments' ? <>
            {columns.map(c => <section className={s.cell} key={c.id}><h3>来源与状态</h3><p>{c.provenance}</p>
              {c.judgments.length ? c.judgments.map((j, i) => <section className={s.judgment} key={i}><h3>{j.label}</h3>
                <div className={s.judgmentProse}><ReactMarkdown remarkPlugins={[remarkGfm]}>{j.text}</ReactMarkdown></div>
              </section>) : <p className={s.hint}>没有记录 Agent 判断；不补造。</p>}
              <Sources column={c}/></section>)}
            <section className={s.cell}><h3>本人版本</h3><p>由你亲自编辑，没有模型 Trace。只保存到本对照，不回写求职工作区。</p>
              <p>{revision ? `已保存 ${revision} 版` : '还没有保存内容'}</p></section>
          </> : sections.map(row => <Fragment key={row.id}>
            {columns.map((c, i) => <section className={s.cell} key={c.id + row.id}><h3>{row.label}</h3>
              {c.id === 'direct' && !c.sections.find(x => x.id === row.id)?.text ?
                <p className={s.hint}>尚无可展示的直调改稿。运行后在此比较；失败输出保留在 Trace，不显示成删除原文。</p> :
              i === 0 ? <div className={s.prose}>{plainResume(row.text)}</div> :
                <Diff before={row.text} after={c.sections.find(x => x.id === row.id)?.text || ''} deletions={deletions}/>}
              <Sources column={c}/></section>)}
            <section className={s.cell}><label className={s.editLabel} htmlFor={'edit-' + row.id}>{row.label}</label>
              <textarea id={'edit-' + row.id} value={draft[row.id] || ''} disabled={busy} maxLength={50000}
                placeholder="在这里写你的版本…" onChange={e => {setDraft({...draft, [row.id]: e.target.value}); setDirty(true);}}/>
              <details className={s.preview}><summary>查看我的改动高亮</summary><Diff before={row.text} after={draft[row.id] || ''} deletions={deletions}/></details>
            </section></Fragment>)}
        </div></div>
    </>}
  </main>;
}
