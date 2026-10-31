'use client';
import {useState} from 'react';
import Link from 'next/link';
import s from './Comparison.module.css';
type Receipt = {id: string; status?: string; calls?: number; error?: string; reused?: boolean};
/** One explicitly authorized pair. The server reserves each arm once, including failed calls. */
export default function EvidenceTrial() {
  const [busy, setBusy] = useState(false), [confirmed, setConfirmed] = useState(false), [recovery, setRecovery] = useState(false);
  const [receipts, setReceipts] = useState<Receipt[]>([]), [error, setError] = useState('');
  async function run(recoverConnection = false) {
    if (busy) return;
    setBusy(true); setConfirmed(false); setError('');
    try {
      for (const arm of ['without_memory', 'with_memory']) {
        const r = await fetch('/api/admin/resume-comparisons/harness', {method: 'POST',
          headers: {'Content-Type': 'application/json'}, body: JSON.stringify({arm,
            ...(recoverConnection && arm === 'without_memory' ? {recoverConnection: true} : {}),
            sourceTraceId: '789f2b98-4fce-4755-abca-33a950e7f73b', acknowledgeCost: true})});
        const receipt: Receipt = await r.json();
        if (receipt.id) setReceipts(previous => [...previous.filter(x => x.id !== receipt.id), receipt]);
        if (!r.ok && r.status !== 409) throw Error(receipt.error || '执行结果未确认');
        // A reserved arm is read back rather than called again. The next arm has its own reservation.
      }
    } catch (e) {setError((e instanceof Error ? e.message : '执行中断') + '；请先按运行编号核对，不要重复发起。');}
    finally {setBusy(false);}
  }
  return <section className={s.boundary} aria-label="本轮有无Memory对照">
    <h2>本轮有无 Memory 对照</h2>
    <p>同稿、同模型 deepseek-v4-flash、B05 固定。每臂最多 6 次调用，不自动重试；只写 Eval，不改原简历或益职积分。</p>
    <button type="button" disabled={busy || receipts.length > 0} onClick={() => {setRecovery(false); setConfirmed(true);}}>
      {busy ? '对照执行中，请勿重复发起…' : '运行修后补验（Memory不重跑）'}</button>
    <button type="button" disabled={busy} onClick={() => {setRecovery(true); setConfirmed(true);}}>补验上次连接超时（仅一次）</button>
    {confirmed && <p>将使用现有 TokenDance 连接并产生供应商费用。
      <button type="button" onClick={() => setConfirmed(false)}>先不运行</button>
      <button type="button" onClick={() => run(recovery)}>确认运行这一对</button></p>}
    {error && <p role="alert">{error}</p>}
    {receipts.map(r => <p key={r.id}>{r.reused ? '有 Memory' : '无 Memory'}：
      {r.status === 'completed' ? '质检通过，仍待人工审阅' : r.status === 'failed' ? '未通过，保留失败证据' : '已有运行，请读回核对'}
      {r.calls != null && ` · ${r.reused ? '复用原' : ''}${r.calls} 次调用${r.reused ? '，本次无新增' : ''}`} · <Link href={'/admin/evals?run=' + r.id}>查看实际 Trace</Link></p>)}
  </section>;
}
