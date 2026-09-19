"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { analyzeResumeGap, MAX_TEXT_LENGTH } from '@/lib/resume-gap/matcher';
import { trackProductEvent } from '@/lib/product-events';

/* ============================
   示例内容（预填，标注「示例，可替换」，避免空页）
   ============================ */

const SAMPLE_JD = [
  '【高级后端开发工程师 · 上海】',
  '1. 3年以上工作经验，精通 Java 或 Go，熟悉 MySQL、Redis、Kafka；',
  '2. 有分布式、高并发系统设计经验，熟悉 Spring Boot、Docker、Kubernetes；',
  '3. 本科及以上学历，英语四级以上，具备良好的沟通能力与跨部门协作能力；',
  '4. 有大数据组件（Spark/Flink）经验者优先。',
].join('\n');

const SAMPLE_RESUME = [
  '2年开发经验，熟悉 Java、MySQL。',
  '- 负责订单模块的接口开发与日常维护',
  '- 参与商品服务的重构，接口平均耗时下降 40%',
  '- 协助完成大促期间的值班与问题跟进',
  '本科，英语四级，现居上海',
].join('\n');

const INITIAL_REPORT = analyzeResumeGap({ resumeText: SAMPLE_RESUME, jdText: SAMPLE_JD });

function clip(text: string): string {
  return text.length > MAX_TEXT_LENGTH ? text.slice(0, MAX_TEXT_LENGTH) : text;
}

/* ============================
   页面
   ============================ */

export default function ResumeJdGapClient() {
  const router = useRouter();
  const [resumeText, setResumeText] = useState(SAMPLE_RESUME);
  const [jdText, setJdText] = useState(SAMPLE_JD);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const usedTracked = useRef(false);

  // 纯前端即时对照：无请求、无模型、无配额
  const report = useMemo(
    () => analyzeResumeGap({ resumeText, jdText }),
    [resumeText, jdText],
  );

  // 登录态探测（决定 CTA 文案）；首次进入打一条 resume_gap_used（匿名可记，仅一次）
  useEffect(() => {
    let alive = true;
    void fetch('/api/auth/session', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: { authenticated?: boolean }) => { if (alive) setAuthenticated(Boolean(d?.authenticated)); })
      .catch(() => { if (alive) setAuthenticated(false); });
    if (!usedTracked.current) {
      usedTracked.current = true;
      trackProductEvent('resume_gap_used', {
        missingCount: INITIAL_REPORT.summary.missingCount,
        hardUnmet: INITIAL_REPORT.summary.hardUnmet,
      });
    }
    return () => { alive = false; };
  }, []);

  const runNow = () => {
    trackProductEvent('resume_gap_used', {
      missingCount: report.summary.missingCount,
      hardUnmet: report.summary.hardUnmet,
    });
    resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // 软引导：本页不调模型。未登录→打 resume_gap_signup 并去登录（回跳本页）；已登录→直接进作战盘
  const goCockpit = () => {
    if (authenticated === false) {
      trackProductEvent('resume_gap_signup', {
        missingCount: report.summary.missingCount,
        hardUnmet: report.summary.hardUnmet,
      });
      router.push('/login?redirect=%2Ftools%2Fresume-jd-gap');
      return;
    }
    router.push('/cockpit');
  };

  const hitTerms = report.matched.filter((m) => m.inResume);
  const isEmptyJd = report.summary.jdKeywordCount === 0;

  return (
    <div className="min-h-screen bg-[#faf8f4] text-stone-800">
      <div className="mx-auto max-w-6xl px-4 py-10 md:px-8 md:py-14">
        {/* ===== 首屏 ===== */}
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
            简历总石沉大海？先把简历和 JD 逐词对一遍，找出缺的关键词和硬门槛。
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-stone-500">
            贴进简历全文和目标 JD，即时对照出：JD 反复出现、简历却没命中的用词；
            经验年限/学历/语言/地点这类硬门槛你卡在哪条；以及哪些经历描述像「只写了职责、没写结果」。
          </p>
          <p className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs font-medium leading-relaxed text-emerald-800">
            隐私说明：简历和 JD 只在你浏览器本地对照，不上传、不调模型。
          </p>
        </motion.header>

        {/* ===== 输入区 ===== */}
        <div className="grid gap-4 md:grid-cols-2">
          <TextareaCard
            label="我的简历（示例，可替换）"
            placeholder="粘贴简历全文：工作经历、项目、技能、教育背景…"
            value={resumeText}
            onChange={setResumeText}
          />
          <TextareaCard
            label="目标 JD（示例，可替换）"
            placeholder="粘贴目标岗位的职位描述 + 任职要求全文…"
            value={jdText}
            onChange={setJdText}
          />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={runNow}
            className="rounded-lg bg-orange-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orange-700"
          >
            找出缺口
          </button>
          <p className="text-xs text-stone-400">
            输入变化也会即时重算；两侧各限 {MAX_TEXT_LENGTH.toLocaleString('zh-CN')} 字符，超出部分自动裁剪。
          </p>
        </div>

        {/* ===== 结果区：先证据，后结论 ===== */}
        <motion.section
          ref={resultsRef}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1 }}
          className="mt-10 space-y-6 scroll-mt-6"
        >
          {isEmptyJd ? (
            <div className="rounded-xl border border-stone-200 bg-white p-6 text-sm text-stone-500 shadow-sm">
              这份 JD 里没抽到可对照的关键词。试试换一份更完整的 JD 文本（含「任职要求」段落）。
            </div>
          ) : (
            <>
              {/* ① 关键词缺口 */}
              <Panel title="① JD 有、简历没命中的关键词" note={`共抽出 ${report.summary.jdKeywordCount} 个 JD 关键词，命中 ${report.summary.matchedCount} 个`}>
                <div className="flex flex-wrap gap-2">
                  {report.missing.map((term) => (
                    <span
                      key={term}
                      className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700"
                    >
                      {term}
                    </span>
                  ))}
                  {report.missing.length === 0 && (
                    <span className="text-sm text-emerald-700">这份 JD 抽到的关键词，简历里都有词面命中。</span>
                  )}
                </div>
                {hitTerms.length > 0 && (
                  <div className="mt-3">
                    <p className="mb-1.5 text-[11px] font-medium text-stone-500">已命中（可放心保留原措辞）：</p>
                    <div className="flex flex-wrap gap-1.5">
                      {hitTerms.map((m) => (
                        <span
                          key={m.term}
                          className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700"
                        >
                          {m.term}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <p className="mt-3 text-xs leading-relaxed text-stone-400">
                  补法：未命中的词先自查——真做过的，用 JD 的说法把对应经历重写一遍；没做过的别硬加（面试一追问就穿帮），
                  可以标成学习中的可迁移项。这是词面命中对照，不等于 ATS 真实判定。
                </p>
              </Panel>

              {/* ② 硬门槛 */}
              {report.hardRequirements.length > 0 && (
                <Panel title="② 硬门槛逐条核验" note="判定只看简历里有没有词面证据，没证据 ≠ 你不满足，请人工确认">
                  <ul className="space-y-2.5">
                    {report.hardRequirements.map((h) => (
                      <li key={h.label} className="rounded-lg border border-stone-100 bg-stone-50/60 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <span className="text-sm font-semibold text-stone-800">{h.label}</span>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                              h.satisfied
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            {h.satisfied ? '简历里有证据' : '未满足 / 存疑'}
                          </span>
                        </div>
                        {h.jdEvidence && (
                          <p className="mt-1.5 border-l-2 border-stone-200 pl-2 text-[11px] leading-relaxed text-stone-500">
                            JD 原文：{h.jdEvidence}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </Panel>
              )}

              {/* ③ 缺量化证据 */}
              {report.weakQuantification.length > 0 && (
                <Panel title="③ 疑似缺量化证据的条目" note="动词开头、却没给数字/百分比/时间的描述，最容易写成「岗位说明书」">
                  <ul className="space-y-1.5">
                    {report.weakQuantification.map((line) => (
                      <li key={line} className="rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2 text-xs leading-relaxed text-stone-700">
                        {line}
                        {line.length >= 60 ? '…' : ''}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-stone-400">
                    补法：每条问自己「后来怎么样了？数字呢？」——写不出数字的，就写范围、频次、对比基准，也别编。
                  </p>
                </Panel>
              )}

              {/* ④ 一句话结论 */}
              <div className="rounded-xl border border-orange-200 bg-white p-5 shadow-sm">
                <h3 className="mb-2 text-sm font-bold text-stone-800">一句话结论（只看词面）</h3>
                <p className="text-sm leading-relaxed text-stone-700">
                  按这份 JD 对照，你的简历主要卡在
                  <span className="font-semibold text-orange-700"> {report.summary.missingCount} 个关键词未命中</span>
                  {report.summary.hardUnmet > 0 && (
                    <>
                      和
                      <span className="font-semibold text-orange-700"> {report.summary.hardUnmet} 条硬门槛存疑</span>
                    </>
                  )}
                  {report.weakQuantification.length > 0 && (
                    <>
                      ，另有
                      <span className="font-semibold text-orange-700"> {report.weakQuantification.length} 条经历缺量化证据</span>
                    </>
                  )}
                  。改法永远是「先核真实经历，再换对方措辞」，不是堆词。
                </p>
                <p className="mt-2 text-xs leading-relaxed text-stone-500">
                  注意：这是词面命中对照，不等于 ATS 真实判定，也不替你编经历；「未满足/存疑」只代表简历里没找到字样证据。
                </p>
              </div>
            </>
          )}
        </motion.section>

        {/* ===== 软引导（不调模型） ===== */}
        <section className="mt-12 rounded-2xl border border-orange-200 bg-orange-50/60 p-6 md:p-8">
          <h2 className="text-base font-bold text-stone-800">缺口找到了，然后逐条补</h2>
          <p className="mt-2 text-sm leading-relaxed text-stone-600">
            本页只做确定性对照；每个未命中词背后该挂哪段真实经历、怎么改出一版针对这个岗位的简历，
            需要教练带着你把素材一条条挖出来。
          </p>
          <div className="mt-4">
            <button
              type="button"
              onClick={goCockpit}
              className="inline-block rounded-lg bg-orange-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orange-700"
            >
              {authenticated === false
                ? '登录后把这份缺口存进作战盘、让教练逐条深挖并出一岗一版 →'
                : '把这份缺口存进作战盘、让教练逐条深挖并出一岗一版 →'}
            </button>
          </div>
          <p className="mt-3 text-xs text-stone-400">
            （存作战盘与深挖需登录；本页对照本身免费、免登录，简历和 JD 不上传、不调模型。）
          </p>
        </section>

        {/* ===== FAQ ===== */}
        <FaqSection />

        <footer className="mt-12 border-t border-stone-200 pt-6 text-center text-xs text-stone-400">
          © 2026 益职AI · 你的私人求职导师 · 对照结果仅供参考，以真实 JD 与你的真实经历为准
        </footer>
      </div>
    </div>
  );
}

/* ============================
   输入卡片
   ============================ */

function TextareaCard({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <span className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-sm font-bold text-stone-800">{label}</span>
        <span className={`text-[11px] tabular-nums ${value.length >= MAX_TEXT_LENGTH ? 'text-amber-600' : 'text-stone-400'}`}>
          {value.length.toLocaleString('zh-CN')} / {MAX_TEXT_LENGTH.toLocaleString('zh-CN')}
        </span>
      </span>
      <textarea
        value={value}
        placeholder={placeholder}
        rows={12}
        onChange={(e) => onChange(clip(e.target.value))}
        className="w-full resize-y rounded-lg border border-stone-300 bg-stone-50/50 px-3 py-2 text-sm leading-relaxed text-stone-800 transition-colors placeholder:text-stone-400 focus:border-orange-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-orange-200"
      />
    </label>
  );
}

/* ============================
   结果分区容器
   ============================ */

function Panel({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-bold text-stone-800">{title}</h3>
      {note && <p className="mb-3 mt-0.5 text-[11px] text-stone-400">{note}</p>}
      <div className={note ? '' : 'mt-3'}>{children}</div>
    </div>
  );
}

/* ============================
   FAQ
   ============================ */

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: '这个对照的 ATS 打分准吗？',
    a: '别当分数看。各家的 ATS 分词、权重和硬性过滤规则都不公开，本页只做词面命中对照，帮你在投递前发现「JD 反复说、简历里却一个字样都没有」的用词差距。它不等于任何真实 ATS 判定，也不产出分值。',
  },
  {
    q: 'JD 里有、但我没做过的关键词，写上去行不行？',
    a: '不行。没做过的经历写上去，面试官顺着追问两个细节就会穿帮，还会连整份简历的信任一起赔掉。正确姿势是：把真实做过、与那个词最接近的一段经历，用 JD 的措辞重写；完全空白的，标成「待确认/正在学」，用可迁移证据（相近技术、自学项目、可量化学习成果）去补。',
  },
  {
    q: '改简历到底是在堆关键词，还是命中真实经历？',
    a: '顺序不能反：先盘点你真实做过什么，再对照 JD 的用词习惯，把同一段经历换成招聘方的说法、放到对方最关心的位置。只堆关键词而经历撑不住，最多帮你过机器初筛，过不了人。本页的「缺量化证据」提醒也是同一逻辑：让关键词后面长出具体的结果。',
  },
  {
    q: '一份简历投好几个岗位，要各改一版吗？',
    a: '看关键词重合度。同方向、同业务线的岗位共用一版主简历即可；跨方向（如后端→数据、产品→运营）或大厂 vs 创业公司口径差别大的，就各出一版：主体经历不动，只重排顺序、替换措辞、补对方最看重的证据。把每个岗位的缺口清单存进作战盘，改版时逐条对照即可。',
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
