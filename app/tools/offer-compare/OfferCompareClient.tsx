"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  compareOffers,
  round2,
  type OfferInput,
  type OfferMetrics,
  type PairwiseDelta,
} from '@/lib/offer/compare';
import { trackProductEvent } from '@/lib/product-events';

/* ============================
   表单状态（字符串受控，计算时转数字）
   ============================ */

interface OfferForm {
  name: string;
  cityLabel: string;
  monthlySalary: string;
  monthsPaid: string;
  yearEndBonusMode: 'months' | 'amount';
  yearEndBonusValue: string;
  socialInsuranceBase: string;
  housingFundRatePct: string;
  signingFee: string;
  equityAnnualPreTax: string;
  weeklyHours: string;
}

const EMPTY_OFFER: OfferForm = {
  name: '新 Offer',
  cityLabel: '',
  monthlySalary: '',
  monthsPaid: '12',
  yearEndBonusMode: 'months',
  yearEndBonusValue: '0',
  socialInsuranceBase: '',
  housingFundRatePct: '12',
  signingFee: '0',
  equityAnnualPreTax: '0',
  weeklyHours: '40',
};

const SAMPLE_OFFERS: OfferForm[] = [
  {
    name: '大厂·后端（示例）',
    cityLabel: '上海',
    monthlySalary: '28000',
    monthsPaid: '16',
    yearEndBonusMode: 'months',
    yearEndBonusValue: '0',
    socialInsuranceBase: '28000',
    housingFundRatePct: '12',
    signingFee: '0',
    equityAnnualPreTax: '60000',
    weeklyHours: '55',
  },
  {
    name: '中厂·核心业务（示例）',
    cityLabel: '杭州',
    monthlySalary: '30000',
    monthsPaid: '13',
    yearEndBonusMode: 'amount',
    yearEndBonusValue: '40000',
    socialInsuranceBase: '12000',
    housingFundRatePct: '5',
    signingFee: '50000',
    equityAnnualPreTax: '0',
    weeklyHours: '45',
  },
];

function toInput(f: OfferForm): OfferInput {
  return {
    name: f.name,
    cityLabel: f.cityLabel,
    monthlySalary: Number(f.monthlySalary),
    monthsPaid: Number(f.monthsPaid),
    yearEndBonusMode: f.yearEndBonusMode,
    yearEndBonusValue: Number(f.yearEndBonusValue),
    socialInsuranceBase: Number(f.socialInsuranceBase),
    housingFundRatePct: Number(f.housingFundRatePct),
    signingFee: Number(f.signingFee),
    equityAnnualPreTax: Number(f.equityAnnualPreTax),
    weeklyHours: Number(f.weeklyHours),
  };
}

function fmt(n: number, digits = 0): string {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

const ESTIMATE_NOTE = '估算 · 以实际账单 / 当地社保公积金与申报为准';

/* ============================
   页面
   ============================ */

export default function OfferCompareClient() {
  const router = useRouter();
  const [offers, setOffers] = useState<OfferForm[]>(SAMPLE_OFFERS);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [savedId, setSavedId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState('');
  const calcTracked = useRef(false);

  // 登录态探测（决定按钮是「保存到我的作战盘」还是「登录后保存」）。失败按未登录处理。
  useEffect(() => {
    let alive = true;
    void fetch('/api/auth/session', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: { authenticated?: boolean }) => { if (alive) setAuthenticated(Boolean(d?.authenticated)); })
      .catch(() => { if (alive) setAuthenticated(false); });
    // 首次使用打一条 offer_calc_used（匿名可记；仅一次）。
    if (!calcTracked.current) {
      calcTracked.current = true;
      trackProductEvent('offer_calc_used', { offerCount: SAMPLE_OFFERS.length });
    }
    return () => { alive = false; };
  }, []);

  const updateOffer = (idx: number, patch: Partial<OfferForm>) => {
    setOffers((prev) => prev.map((o, i) => (i === idx ? { ...o, ...patch } : o)));
  };

  const result = useMemo(
    () => compareOffers(offers.map(toInput)),
    [offers],
  );

  const addThird = () => {
    setOffers((prev) => {
      if (prev.length >= 3) return prev;
      trackProductEvent('offer_added', { count: prev.length + 1 });
      return [...prev, { ...EMPTY_OFFER, name: `Offer ${String.fromCharCode(65 + prev.length)}` }];
    });
  };

  // 「存进作战盘」：未登录→打 offer_save_signup 并跳登录、回跳本页继续保存；
  // 已登录→POST /api/offers/save 落库（复用 offer-save 纯校验 + createCockpitOpportunity）。
  const saveToCockpit = async () => {
    if (authenticated === false) {
      trackProductEvent('offer_save_signup', { offerCount: offers.length });
      router.push('/login?redirect=%2Ftools%2Foffer-compare');
      return;
    }
    trackProductEvent('offer_save_click', { offerCount: offers.length });
    setSaveStatus('saving');
    setSaveError('');
    try {
      const response = await fetch('/api/offers/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offers: offers.map(toInput) }),
      });
      const data = await response.json().catch(() => null as null | { ok?: boolean; id?: string; error?: string });
      if (response.status === 401) {
        setAuthenticated(false);
        trackProductEvent('offer_save_signup', { offerCount: offers.length, late: true });
        router.push('/login?redirect=%2Ftools%2Foffer-compare');
        return;
      }
      if (!response.ok || !data?.ok || !data.id) {
        setSaveStatus('error');
        setSaveError(data?.error || '保存失败，请稍后重试');
        return;
      }
      setSavedId(data.id);
      setSaveStatus('saved');
    } catch {
      setSaveStatus('error');
      setSaveError('网络异常，未保存');
    }
  };

  return (
    <div className="min-h-screen bg-[#faf8f4] text-stone-800">
      <div className="mx-auto max-w-6xl px-4 py-10 md:px-8 md:py-14">
        {/* ===== 首屏：H1 + 工具即见 ===== */}
        <motion.header
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="mb-8"
        >
          <p className="mb-2 text-xs font-semibold tracking-wide text-orange-600">
            益职AI · 免费工具 · 无需登录
          </p>
          <h1 className="text-2xl font-bold leading-snug md:text-[28px]">
            别只比月薪。把每个 offer 换成「税后到手 + 时薪 + 首年净得」再决定。
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-stone-500">
            贴进 2–3 个 offer 的月薪、发放月数、年终奖、五险一金基数、签字费和期权，
            实时换算成可比口径。我们比别家多做一步：差异归因 + 岗位决策提醒——
            钱算清之后，成长和团队还是要你自己比。
          </p>
          <p className="mt-2 text-xs text-stone-400">
            所有数字均为 {ESTIMATE_NOTE}。当前预填的是示例数字，可改。
          </p>
        </motion.header>

        {/* ===== 输入列 ===== */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {offers.map((offer, idx) => (
            <OfferColumn
              key={idx}
              offer={offer}
              metrics={result.perOffer[idx]}
              onChange={(patch) => updateOffer(idx, patch)}
            />
          ))}
          {offers.length < 3 && (
            <button
              onClick={addThird}
              className="flex min-h-[120px] items-center justify-center rounded-xl border-2 border-dashed border-stone-300 text-sm font-medium text-stone-500 transition-colors hover:border-orange-400 hover:text-orange-600"
            >
              + 添加第 3 个 offer
            </button>
          )}
        </div>

        {/* ===== 结果区：先证据，后结论 ===== */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1 }}
          className="mt-10 space-y-6"
        >
          {/* 三块核心指标卡 */}
          <div className="grid gap-4 md:grid-cols-3">
            {result.perOffer.map((m, idx) => (
              <MetricCard key={idx} metrics={m} isBest={pickBest(result.best, idx)} />
            ))}
          </div>

          {/* 证据明细：每项怎么来的 */}
          <EvidencePanel metrics={result.perOffer} />

          {/* 首年净差 + 归因 */}
          <DeltasPanel offers={result.perOffer} deltas={result.pairwiseDeltas} />

          {/* 一句话倾向结论 */}
          <ConclusionPanel metrics={result.perOffer} best={result.best} />

          <p className="text-xs leading-relaxed text-stone-400">
            口径假设（都可改）：个税按「月度累计预扣」简化近似，未计专项附加扣除与年度汇算；
            年终奖按全年一次性奖金单独计税近似；五险一金 = 缴纳基数 ×（养老 8% + 医疗 2% + 失业 0.5% + 公积金个人比例），
            当地基数上下限未内置，请自行对照填基数；期权按你填的年化额并入，不计税不折现不模拟归属；
            时薪按 年税后到手 ÷（周工时 × 52）。大小周请折算进周工时。
            以上全部是 {ESTIMATE_NOTE}。
          </p>
        </motion.section>

        {/* ===== 软引导 ===== */}
        <section className="mt-12 rounded-2xl border border-orange-200 bg-orange-50/60 p-6 md:p-8">
          <h2 className="text-base font-bold text-stone-800">算清了钱，然后呢？</h2>
          <p className="mt-2 text-sm leading-relaxed text-stone-600">
            计算器看不见的东西，往往才是决定性因素：岗位职责、直属 leader、晋升节奏、业务风险。
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={saveToCockpit}
              disabled={saveStatus === 'saving'}
              className="inline-block rounded-lg bg-orange-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {authenticated === false
                ? '登录后，把这几份 offer 存进我的求职作战盘 →'
                : saveStatus === 'saving'
                ? '保存中…'
                : saveStatus === 'saved'
                ? '已存进作战盘 ✓'
                : '把这几份 offer 存进我的求职作战盘，连岗位职责与成长一起比 →'}
            </button>
            {saveStatus === 'saved' && savedId && (
              <a
                href="/cockpit"
                className="text-sm font-medium text-orange-700 underline-offset-2 hover:underline"
              >
                去作战盘查看这条 Offer 决策 →
              </a>
            )}
            <button
              onClick={() => window.print()}
              className="rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-600 transition-colors hover:border-orange-400 hover:text-orange-700"
            >
              打印 / 导出对比结果
            </button>
          </div>
          {saveStatus === 'error' && (
            <p className="mt-2 text-xs text-red-600">{saveError}</p>
          )}
          <p className="mt-3 text-xs text-stone-400">
            （存作战盘需登录，保存的是这份对比的输入与结论；本页计算本身免费、免登录、不上传数据。）
          </p>
        </section>

        {/* ===== FAQ ===== */}
        <FaqSection />

        <footer className="mt-12 border-t border-stone-200 pt-6 text-center text-xs text-stone-400">
          © 2026 益职AI · 你的私人求职导师 · 本页数字均为{ESTIMATE_NOTE}
        </footer>
      </div>
    </div>
  );
}

function pickBest(best: { byPackage: number; byNet: number; byHourly: number }, idx: number) {
  return {
    package: best.byPackage === idx,
    net: best.byNet === idx,
    hourly: best.byHourly === idx,
  };
}

/* ============================
   输入列
   ============================ */

function Field({
  label,
  suffix,
  value,
  onChange,
  hint,
}: {
  label: string;
  suffix?: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-stone-500">
        {label}
        {suffix && <span className="ml-1 text-stone-400">（{suffix}）</span>}
      </span>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-sm text-stone-800 transition-colors focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-200"
      />
      {hint && <span className="mt-0.5 block text-[10px] leading-tight text-stone-400">{hint}</span>}
    </label>
  );
}

function OfferColumn({
  offer,
  metrics,
  onChange,
}: {
  offer: OfferForm;
  metrics: OfferMetrics | undefined;
  onChange: (patch: Partial<OfferForm>) => void;
}) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <input
        value={offer.name}
        onChange={(e) => onChange({ name: e.target.value })}
        className="mb-1 w-full border-none bg-transparent text-sm font-bold text-stone-800 focus:outline-none"
        placeholder="offer 名称"
      />
      <input
        value={offer.cityLabel}
        onChange={(e) => onChange({ cityLabel: e.target.value })}
        className="mb-3 w-full border-none bg-transparent text-xs text-stone-400 focus:outline-none"
        placeholder="城市（仅展示用）"
      />
      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
        <Field label="税前月薪" suffix="元" value={offer.monthlySalary} onChange={(v) => onChange({ monthlySalary: v })} />
        <Field label="发放月数" suffix="如 12/13/16" value={offer.monthsPaid} onChange={(v) => onChange({ monthsPaid: v })} />
        <label className="col-span-2 block">
          <span className="mb-1 flex items-center gap-2 text-[11px] font-medium text-stone-500">
            年终奖
            <span className="inline-flex overflow-hidden rounded-md border border-stone-300">
              {(['months', 'amount'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onChange({ yearEndBonusMode: mode })}
                  className={`px-2 py-0.5 text-[11px] ${
                    offer.yearEndBonusMode === mode
                      ? 'bg-orange-600 text-white'
                      : 'bg-white text-stone-500 hover:bg-stone-50'
                  }`}
                >
                  {mode === 'months' ? '按月薪倍数' : '固定元额'}
                </button>
              ))}
            </span>
          </span>
          <Field
            label={offer.yearEndBonusMode === 'months' ? '月薪倍数（0 表示无）' : '固定金额'}
            suffix={offer.yearEndBonusMode === 'months' ? '个月' : '元'}
            value={offer.yearEndBonusValue}
            onChange={(v) => onChange({ yearEndBonusValue: v })}
          />
        </label>
        <Field
          label="五险一金基数"
          suffix="元"
          value={offer.socialInsuranceBase}
          onChange={(v) => onChange({ socialInsuranceBase: v })}
          hint="默认建议=月薪；有当地上下限"
        />
        <Field label="公积金个人比例" suffix="%" value={offer.housingFundRatePct} onChange={(v) => onChange({ housingFundRatePct: v })} hint="常见 5–12" />
        <Field label="签字费" suffix="元·仅首年" value={offer.signingFee} onChange={(v) => onChange({ signingFee: v })} />
        <Field label="期权年化税前" suffix="元/年" value={offer.equityAnnualPreTax} onChange={(v) => onChange({ equityAnnualPreTax: v })} hint="不计税不折现" />
        <Field label="每周工作小时" suffix="h" value={offer.weeklyHours} onChange={(v) => onChange({ weeklyHours: v })} hint="大小周折算进这里" />
      </div>
      {metrics && (
        <p className="mt-3 border-t border-stone-100 pt-2 text-[11px] text-stone-400">
          持续年包 {fmt(metrics.grossAnnualPackage)} 元 · 年到手 {fmt(metrics.annualNet)} 元
        </p>
      )}
    </div>
  );
}

/* ============================
   三块指标卡
   ============================ */

function MetricCard({
  metrics,
  isBest,
}: {
  metrics: OfferMetrics;
  isBest: { package: boolean; net: boolean; hourly: boolean };
}) {
  const rows: Array<{ label: string; value: string; unit: string; best: boolean }> = [
    { label: '税前年包（持续）', value: fmt(metrics.grossAnnualPackage), unit: '元/年', best: isBest.package },
    { label: '税后年到手', value: fmt(metrics.annualNet), unit: '元/年', best: isBest.net },
    { label: '税后时薪', value: fmt(metrics.hourlyNet, 2), unit: '元/小时', best: isBest.hourly },
  ];
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="truncate text-sm font-bold text-stone-800">{metrics.name || '未命名 offer'}</h3>
        {metrics.cityLabel && <span className="shrink-0 text-xs text-stone-400">{metrics.cityLabel}</span>}
      </div>
      <div className="space-y-2.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-2">
            <span className="text-xs text-stone-500">{r.label}</span>
            <span className="text-right">
              <span className="text-base font-bold tabular-nums text-stone-800">{r.value}</span>
              <span className="ml-1 text-[10px] text-stone-400">{r.unit}</span>
              {r.best && (
                <span className="ml-1.5 rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700">
                  最高
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-3 border-t border-stone-100 pt-2 text-[10px] text-stone-400">
        首年净得（含签字费）{fmt(metrics.firstYearTotalNet)} 元 · {ESTIMATE_NOTE}
      </p>
    </div>
  );
}

/* ============================
   证据面板：先展示每项怎么来的
   ============================ */

function EvidencePanel({ metrics }: { metrics: OfferMetrics[] }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
      <h3 className="mb-1 text-sm font-bold text-stone-800">这些数字怎么来的（公式与明细）</h3>
      <p className="mb-3 text-xs text-stone-400">先看证据，再看结论。逐月口径为摊到 12 个月的近似预扣。</p>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {metrics.map((m, idx) => (
          <details key={idx} open={idx === 0} className="group rounded-lg border border-stone-100 bg-stone-50/60 p-3">
            <summary className="cursor-pointer select-none text-xs font-semibold text-stone-700">
              {m.name || `Offer ${idx + 1}`} · 明细
            </summary>
            <dl className="mt-2 space-y-1.5 text-[11px] leading-relaxed">
              <Row k="年工资 = 月薪 × 发放月数" v={`${fmt(m.salaryAnnual)} 元`} />
              <Row k="年终奖（税前）" v={`${fmt(m.bonusAnnual)} 元`} />
              <Row k="期权年化（税前，不另计税）" v={`${fmt(m.equityAnnualPreTax)} 元`} />
              <Row k="签字费（仅首年计）" v={`${fmt(m.signingFee)} 元`} />
              <Row k="五险一金个人 / 月（社保+公积金基数同）" v={`${fmt(m.monthlyDeduction)} 元`} />
              <Row k="月度摊薄税前 / 应纳税所得额" v={`${fmt(m.monthlyPreTaxAvg)} / ${fmt(m.monthlyTaxable)} 元`} />
              <Row k="月度个税（近似，起征点 5000）" v={`${fmt(m.monthlyTax)} 元`} />
              <Row k="月度税后到手" v={`${fmt(m.monthlyNet)} 元`} />
              <Row k="年终奖单独计税（近似）" v={`${fmt(m.bonusTax)} 元`} />
              <Row k="年税后到手 = 月到手×12 + 年终奖税后 + 期权" v={`${fmt(m.annualNet)} 元`} />
              <Row k={`时薪 = 年到手 ÷（${fmt(m.weeklyHours)}h × ${m.weeksPerYear} 周）`} v={`${fmt(m.hourlyNet, 2)} 元/小时`} />
            </dl>
          </details>
        ))}
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-stone-500">{k}</dt>
      {v && <dd className="shrink-0 font-medium tabular-nums text-stone-700">{v}</dd>}
    </div>
  );
}

/* ============================
   首年净差 + 归因
   ============================ */

function DeltasPanel({ offers, deltas }: { offers: OfferMetrics[]; deltas: PairwiseDelta[] }) {
  if (deltas.length === 0) return null;
  const money = (n: number) => `${n >= 0 ? '+' : '−'}${fmt(Math.abs(n))} 元`;
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
      <h3 className="mb-3 text-sm font-bold text-stone-800">两两对比：首年净差与差异归因</h3>
      <div className="space-y-5">
        {deltas.map((d, idx) => {
          const from = offers[d.from];
          const to = offers[d.to];
          return (
            <div key={idx} className="rounded-lg border border-stone-100 bg-stone-50/60 p-3.5">
              <p className="text-xs font-semibold text-stone-700">
                以「{from.name}」为基准，「{to.name}」：
              </p>
              <div className="mt-2 grid gap-2 text-xs sm:grid-cols-3">
                <DeltaStat label="税后年到手差" value={money(d.netAnnualDiff)} />
                <DeltaStat label="首年净得差（含签字费）" value={money(d.firstYearDiff)} />
                <DeltaStat
                  label="税后时薪差（元/小时）"
                  value={`${d.hourlyDiff >= 0 ? '+' : '−'}${fmt(Math.abs(d.hourlyDiff), 2)}`}
                />
              </div>
              {d.topDrivers.length > 0 && (
                <div className="mt-3">
                  <p className="text-[11px] font-medium text-stone-500">差异主要来自（按贡献绝对值排序）：</p>
                  <ul className="mt-1 space-y-0.5">
                    {d.topDrivers.slice(0, 4).map((t, i) => (
                      <li key={i} className="flex items-baseline justify-between gap-3 text-[11px] text-stone-600">
                        <span>{t.component}</span>
                        <span className="shrink-0 font-semibold tabular-nums text-stone-800">{money(t.amount)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {d.topDrivers.length === 0 && (
                <p className="mt-2 text-[11px] text-stone-400">两项口径下没有差异。</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DeltaStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-stone-200 bg-white px-2.5 py-2">
      <div className="text-[10px] text-stone-400">{label}</div>
      <div className="font-bold tabular-nums text-stone-800">{value}</div>
    </div>
  );
}

/* ============================
   结论区
   ============================ */

function ConclusionPanel({
  metrics,
  best,
}: {
  metrics: OfferMetrics[];
  best: { byPackage: number; byNet: number; byHourly: number };
}) {
  if (metrics.length < 2) return null;
  const netWinner = metrics[best.byNet];
  const hourlyWinner = metrics[best.byHourly];
  const runnerUp =
    metrics.length === 2
      ? metrics.find((_, i) => i !== best.byNet)
      : undefined;
  const netGap = runnerUp
    ? round2(netWinner.annualNet - runnerUp.annualNet)
    : 0;
  const hourlySame = best.byNet === best.byHourly;

  return (
    <div className="rounded-xl border border-orange-200 bg-white p-5 shadow-sm">
      <h3 className="mb-2 text-sm font-bold text-stone-800">一句话倾向（只看钱）</h3>
      <p className="text-sm leading-relaxed text-stone-700">
        若只比「税后到手」，<span className="font-semibold text-orange-700">{netWinner.name}</span> 领先
        {netGap > 0 && <>（每年约多 {fmt(netGap)} 元）</>}
        {hourlySame
          ? '，按时薪算也是它占优'
          : <>；但按「税后时薪」则是 <span className="font-semibold text-orange-700">{hourlyWinner.name}</span> 更高——多出来的钱可能是在用时长换</>}
        。这个结论完全依赖上方假设：基数按你填的来、期权未计税未折现、签字费只算首年、时薪不含通勤。
      </p>
      <p className="mt-2 text-xs leading-relaxed text-stone-500">
        假设不对？直接改上面的输入，所有数字实时重算。别忘了：总包接近时，决定权在岗位内容、leader 与晋升节奏——
        那些才是该存进作战盘一起比的东西。以上均为{ESTIMATE_NOTE}，不构成任何「稳了」的判断。
      </p>
    </div>
  );
}

/* ============================
   FAQ
   ============================ */

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: '两个 offer 总包一样，要不要随便选？',
    a: '别。总包相同不代表到手相同：公积金基数与比例会让每月现金流和公积金账户留存差出几千到几万；期权是否可变现、归属节奏如何，也要单独问清。把两边基数、比例、周工时分别填进计算器，再去看岗位职责与晋升空间——钱一样时，比的就不该是钱。',
  },
  {
    q: '签字费要不要算进总包？',
    a: '算，但只算进「首年」。签字费是一次性的，并进持续年包会虚高你的长期基准；很多 offer 还有「不满一年离职退还」条款。本页把它单列在首年净得口径里，谈薪时也可以拿「签字费换月薪」去对比长期价值。',
  },
  {
    q: '期权 / 股票怎么并进年包？',
    a: '把「平均每年税前大约值多少」填进期权限年化字段即可——本页按你的假设线性计入，不计税、不折现、不模拟归属失败风险。真实价值受上市、行权价、税率影响，未归属的部分要打折看待。',
  },
  {
    q: '五险一金按最低基数交，到底差多少？',
    a: '两头亏：到手看着多一点，但公积金账户留存和将来失业金、养老金都缩水。在这页把「五险一金基数」改成公司实际申报的数（很多公司按最低基数），年到手和时薪立刻重算，差距一目了然。',
  },
  {
    q: '大小周怎么算时薪？',
    a: '折算进周工时：单双休交替大约 48 小时/周，纯大小周可能 46–55 之间，通勤远的可以把通勤时间也加进去。本页用「年税后到手 ÷（周工时×52）」，所以同样年薪下，大小周的时薪会被直接稀释。',
  },
];

function FaqSection() {
  return (
    <section className="mt-12">
      <h2 className="mb-4 text-base font-bold text-stone-800">常见问题</h2>
      <div className="space-y-2.5">
        {FAQS.map((f) => (
          <details key={f.q} className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
            <summary className="cursor-pointer select-none text-sm font-semibold text-stone-700">
              {f.q}
            </summary>
            <p className="mt-2 text-sm leading-relaxed text-stone-600">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
