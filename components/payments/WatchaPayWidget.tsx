'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Coins, RefreshCw, X } from 'lucide-react';
import type { WatchaPayAccess } from '@/lib/watcha-pay';
import styles from './WatchaPayWidget.module.css';
type State = { balance: number; pendingAmount?: number; account: { configured: false } | { configured: true; environment: 'live' | 'sandbox'; result: WatchaPayAccess } };
export default function WatchaPayWidget() {
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const load = useCallback(async () => {
    setBusy(true); setError(''); setConfirmed(false);
    try {
      const response = await fetch('/api/payments/watcha/wallet', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || '积分暂不可用，请重试');
      setState(data);
    } catch (e) { setError(e instanceof Error ? e.message : '积分暂不可用，请重试'); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const redeem = async () => {
    if (busy || !confirmed) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/payments/watcha/wallet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmExchange: true }) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || '兑换暂未确认，请重试');
      setNotice(data.redeemed ? `${data.redeemed} 积分已转入益职` : '没有待兑换积分');
      setConfirmed(false);
      window.dispatchEvent(new Event('yizhi-quota-changed'));
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : '兑换暂未确认，请重试'); }
    finally { setBusy(false); }
  };
  if (state && !state.account.configured) return null;
  if (!state && !error) return null;
  const account = state?.account;
  const result = account?.configured ? account.result : null;
  const available = result && result.access !== 'unavailable' ? result : null;
  const sandbox = account?.configured && account.environment === 'sandbox';
  return <>
    <button type="button" className={styles.trigger} onClick={() => { dialog.current?.showModal(); void load(); }} aria-haspopup="dialog"><Coins size={16} aria-hidden="true" /><span>积分{state ? ` · ${state.balance}` : ''}</span></button>
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="watcha-wallet-title" onClose={() => setConfirmed(false)} onClick={e => { if (e.target === e.currentTarget) dialog.current?.close(); }}>
      <div className={styles.header}><h2 id="watcha-wallet-title">益职积分{sandbox ? ' · 沙箱' : ''}</h2><button type="button" autoFocus aria-label="关闭积分窗口" onClick={() => dialog.current?.close()}><X size={20} /></button></div>
      <div className={styles.balance}><span>益职可用积分</span><strong>{state?.balance ?? '—'}</strong><p>免费额度用完后，每次 AI 处理预留 1 积分；失败退回。已连接 TokenPay 时优先使用 TokenPay。</p></div>
      <details><summary>哪些操作消耗额度？</summary><ul><li>保存原文、修改简历、保存笔记、预览和导出：免费。</li><li>材料 AI 分析、岗位搜索、导师每次回答：聊天额度。</li><li>简历编辑器生成改写：简历额度。</li><li>面试反馈：面试额度；免费面试使用聊天免费额度。</li><li>免费或已购次数用完后，每次 AI 处理用 1 积分；10 积分不是 10 场完整面试。</li><li>TokenPay 按实际模型用量计费；处理失败的用量保护以付款渠道规则为准。</li></ul></details>
      {available && <>
        <div className={styles.offer}><div><h3>{sandbox ? '沙箱测试商品' : '求职辅导体验包'}</h3><p>{sandbox ? '模拟购买，不收取真实资金' : '10 积分 · ¥9.90'}</p></div><a className={styles.primary} href={available.purchase.url} target="_blank" rel="noopener noreferrer">支付宝购买</a></div>
        {available.purchase.qrUrl && <div className={styles.qr}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={available.purchase.qrUrl} alt="支付宝购买二维码" width="160" height="160" referrerPolicy="no-referrer" /><span>电脑上可用支付宝扫码</span>
        </div>}
        <div className={styles.exchange}><div><span>渠道待兑换</span><strong>{available.entitlement.remaining} 积分</strong><button type="button" disabled={busy} onClick={() => { setNotice(''); void load(); }}><RefreshCw size={14} aria-hidden="true" />{busy ? '查询中…' : '付款后刷新'}</button></div>
          <label><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} disabled={busy} />我确认将渠道积分兑换到益职；兑换后渠道不支持原路退款。</label>
          {(state?.pendingAmount ?? 0) > 0 && <p role="status">有 {state?.pendingAmount} 积分兑换待确认，可安全重试。</p>}
          <button type="button" className={styles.primary} disabled={busy || !confirmed || (available.entitlement.remaining < 1 && !state?.pendingAmount)} onClick={() => void redeem()}>{busy ? '处理中…' : state?.pendingAmount ? '继续确认兑换' : '兑换到益职'}</button>
        </div>
      </>}
      {result?.access === 'unavailable' && <p role="status">商品尚未开放购买，请稍后再试。</p>}
      {notice && <p className={styles.notice} role="status">{notice}</p>}
      {error && <div className={styles.error} role="alert"><p>{error}</p><button type="button" disabled={busy} onClick={() => void load()}>重试查询</button></div>}
    </dialog>
  </>;
}
