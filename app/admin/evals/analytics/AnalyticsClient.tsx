"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { AnalyticsSummary } from "@/lib/admin-analytics";
import { analyticsDay } from "@/lib/admin-analytics";
import TutorMarkdown from "@/components/cockpit/TutorMarkdown";
import styles from "./Analytics.module.css";

const number = (v: number) =>
  new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(v);
const duration = (v: number | null) =>
  v === null
    ? "不可估算"
    : v < 60
      ? `${Math.round(v)} 秒`
      : `${(v / 60).toFixed(1)} 分钟`;
const percent = (v: number | null) =>
  v === null ? "待积累" : `${(v * 100).toFixed(1)}%`;
const date = (v: string | null | undefined) =>
  v
    ? new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(v))
    : "未记录";
const tabs = [
  { id: "turns", label: "导师辅导" },
  { id: "resumeChat", label: "简历讨论" },
  { id: "legacyChat", label: "历史聊天" },
  { id: "opportunities", label: "简历与 JD" },
] as const;
type Kind = (typeof tabs)[number]["id"];
interface DetailRow {
  id: string;
  opportunityId?: string | null;
  sessionId?: string | null;
  createdAt?: string;
  company?: string;
  role?: string;
  stage?: string;
  status?: string;
  updatedAt?: string;
  state?: string;
  question?: string;
  answer?: string;
  content?: string;
  jd?: string;
  sourceResume?: string;
  workingResume?: string;
  replacementIssues?: number;
  changeCount?: number;
  truncated?: boolean;
  conversation?: {
    id: string;
    message: string;
    reply: string;
    status: string;
    savedAt: string;
  }[];
  answers?: { question: string; answer: string; savedAt: string }[];
}
interface Detail {
  kind: string;
  rows: DetailRow[];
  nextOffset: number | null;
  textLimit: number;
  truncated?: boolean;
}
async function read<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    signal,
    cache: "no-store",
    credentials: "same-origin",
  });
  const body = await response.json();
  if (!response.ok)
    throw new Error(
      response.status === 401
        ? "登录已失效，请重新登录。"
        : response.status === 403
          ? "当前账号没有管理员权限。"
          : body.error || "读取失败，请重试。",
    );
  return body;
}
function Trend({ rows }: { rows: AnalyticsSummary["daily"] }) {
  const max = Math.max(1, ...rows.map((r) => r.pv || 0)),
    x = (i: number) => 48 + (i / Math.max(1, rows.length - 1)) * 704,
    y = (n: number) => 206 - (n / max) * 164;
  const visible = rows
    .map((r, i) => ({ ...r, i }))
    .filter((r) => r.pv !== null);
  return (
    <figure className={styles.trend}>
      <figcaption>
        每日访问 <span>PV 实线 · UV 虚线</span>
      </figcaption>
      <svg
        viewBox="0 0 800 244"
        role="img"
        aria-label="每日已记录页面 PV 与 UV 趋势，精确数值见下方每日明细"
      >
        {[...new Set([0, Math.ceil(max / 2), max])].map((v, i) => (
          <g key={i}>
            <line
              x1="48"
              x2="752"
              y1={y(v)}
              y2={y(v)}
              className={styles.gridLine}
            />
            <text x="36" y={y(v) + 5} textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        <polyline
          points={visible.map((r) => `${x(r.i)},${y(r.pv!)}`).join(" ")}
          className={styles.pvLine}
        />
        <polyline
          points={visible.map((r) => `${x(r.i)},${y(r.uv)}`).join(" ")}
          className={styles.uvLine}
        />
        {visible.length === 1 ? (
          <circle
            cx={x(visible[0].i)}
            cy={y(visible[0].pv!)}
            r="3"
            className={styles.pvDot}
          />
        ) : null}
        {[0, Math.floor((rows.length - 1) / 2), rows.length - 1].map((i, k) => (
          <text
            key={k}
            x={x(i)}
            y="236"
            textAnchor={k === 0 ? "start" : k === 2 ? "end" : "middle"}
          >
            {rows[i]?.day.slice(5)}
          </text>
        ))}
      </svg>
      <details>
        <summary>每日明细</summary>
        <div className={styles.scrollTable}>
          <table>
            <thead>
              <tr>
                <th>日期</th>
                <th>PV</th>
                <th>UV</th>
                <th>新增账户</th>
              </tr>
            </thead>
            <tbody>
              {rows
                .slice()
                .reverse()
                .map((r) => (
                  <tr key={r.day}>
                    <td>{r.day}</td>
                    <td>{r.pv === null ? "未覆盖" : number(r.pv)}</td>
                    <td>{r.pv === null ? "未覆盖" : number(r.uv)}</td>
                    <td>{r.registered}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
function Overview({ data }: { data: AnalyticsSummary }) {
  const [eventQuery, setEventQuery] = useState("");
  const features = data.features.filter((r) =>
    `${r.name} ${r.label}`.toLowerCase().includes(eventQuery.toLowerCase()),
  );
  return (
    <>
      <div className={styles.coverage}>
        <p>
          {data.traffic.mode === "unified"
            ? `统一页面埋点 · 本区间从 ${date(data.traffic.firstUnified)} 起有记录，未与旧埋点相加。`
            : "历史入口统计 · 仅覆盖首页、工作区、简历工具，不代表全站访问。"}
        </p>
        <p>
          UV 为浏览器／账户去重标识，不等于自然人数；匿名与登录未合并。
          {data.traffic.knownHostViews < data.traffic.pv
            ? "部分历史事件没有域名，不能只归于新域。"
            : ""}
        </p>
      </div>
      <div className={styles.summaryGrid}>
        <dl className={styles.metrics}>
          <div>
            <dt>页面 UV</dt>
            <dd>{number(data.traffic.uv)}</dd>
          </div>
          <div>
            <dt>页面 PV</dt>
            <dd>{number(data.traffic.pv)}</dd>
          </div>
          <div>
            <dt>新增账户</dt>
            <dd>{number(data.totals.newUsers)}</dd>
          </div>
          <div>
            <dt>活跃账户</dt>
            <dd>{number(data.totals.activeUsers)}</dd>
          </div>
          <div>
            <dt>
              会话平均时长 <small>估算</small>
            </dt>
            <dd>{duration(data.usage.averageSeconds)}</dd>
          </div>
          <div>
            <dt>
              次日留存 <small>已成熟</small>
            </dt>
            <dd>{percent(data.retention.rate)}</dd>
          </div>
        </dl>
        <div>
          <Trend rows={data.daily} />
          <p className={styles.note}>
            今天截至 {date(data.generatedAt)}
            。新埋点上线前不补造历史；全周期历史入口：
            {number(data.traffic.legacyPv)} 次 / {number(data.traffic.legacyUv)}{" "}
            个标识。
          </p>
        </div>
      </div>
      <div className={styles.columns}>
        <section>
          <div className={styles.sectionHead}>
            <h2>功能使用</h2>
            <span>{number(data.totals.events)} 条事件</span>
          </div>
          <label className={styles.search}>
            <span>筛选事件</span>
            <input
              aria-label="筛选事件"
              value={eventQuery}
              onChange={(e) => setEventQuery(e.target.value)}
              placeholder="名称或埋点代码"
            />
          </label>
          <div className={styles.scrollTable}>
            <table>
              <thead>
                <tr>
                  <th>事件</th>
                  <th>次数</th>
                  <th>标识</th>
                  <th>账户</th>
                </tr>
              </thead>
              <tbody>
                {features.map((r) => (
                  <tr key={r.name}>
                    <td>
                      {r.label}
                      <code>{r.name}</code>
                    </td>
                    <td>{number(r.count)}</td>
                    <td>{number(r.identities)}</td>
                    <td>{number(r.users)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!features.length ? (
            <p className={styles.empty}>这个范围没有匹配的埋点。</p>
          ) : null}
          <p className={styles.note}>
            次数是事件条数；开始、成功、失败分别显示，不是功能完成率。
          </p>
        </section>
        <div className={styles.sideSections}>
          <section>
            <div className={styles.sectionHead}>
              <h2>次日留存</h2>
              <span>
                {data.retention.numerator} / {data.retention.denominator} 人
              </span>
            </div>
            <p className={styles.note}>
              注册次日有产品活动算返回；次日已完整结束才入分母。
              {data.retention.pending} 人待成熟。
            </p>
            <div className={styles.scrollTable}>
              <table>
                <thead>
                  <tr>
                    <th>注册日</th>
                    <th>注册</th>
                    <th>次日返回</th>
                    <th>留存</th>
                  </tr>
                </thead>
                <tbody>
                  {data.retention.cohorts.map((r) => (
                    <tr key={r.day}>
                      <td>{r.day.slice(5)}</td>
                      <td>{r.registered}</td>
                      <td>{r.mature ? r.returned : "待成熟"}</td>
                      <td>
                        {r.mature ? percent(r.returned / r.registered) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!data.retention.cohorts.length ? (
              <p className={styles.empty}>所选时间没有新注册账户。</p>
            ) : null}
          </section>
          <section>
            <div className={styles.sectionHead}>
              <h2>访问来源</h2>
              <span>首触来源</span>
            </div>
            <table>
              <thead>
                <tr>
                  <th>来源</th>
                  <th>PV</th>
                  <th>UV</th>
                </tr>
              </thead>
              <tbody>
                {data.sources.map((r) => (
                  <tr key={r.source}>
                    <td className={styles.wrap}>{r.source}</td>
                    <td>{number(r.pv)}</td>
                    <td>{number(r.uv)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className={styles.note}>
              来源 UV 可能重叠，不可相加。未记录不推测成 direct。
            </p>
          </section>
        </div>
      </div>
      <details className={styles.methods}>
        <summary>统计方法与数据覆盖</summary>
        <p>
          数据来自 users 与
          product_events，按服务端接收时间、北京时间自然日统计；查询直接读取后台，无本地模拟补值。仅排除明确标记的测试、预览和内部事件：
          {data.totals.excludedEvents} 条；另有 {data.totals.diagnosticEvents}{" "}
          条诊断 Trace 不计产品活跃。没有标记的测试流量仍可能混入。
        </p>
        <p>
          另有 {data.totals.unmatchedEvents} 条历史事件的用户 ID
          无法关联当前账号表，已单列排除，未计入账户、访问、功能和时长。没有擅自归并或删除这些记录。
        </p>
        <p>
          时长按同一标识的事件间隔估算：超过 30 分钟另开会话，每段最多记 5
          分钟；{data.usage.sessions} 次会话中 {data.usage.singleEventSessions}{" "}
          次仅一条事件（记 0 秒），总可观测时长 {duration(data.usage.seconds)}
          。不是准确的前台停留时长。
        </p>
        <p>
          总账户 {data.totals.users}{" "}
          个，不受时间筛选；新增、活跃和事件受时间筛选。最多完整读取 20,000 事件
          / 10,000 账户，超限直接报错，不报截断总量。
        </p>
      </details>
    </>
  );
}
function UserDetail({
  user,
  onClose,
}: {
  user: AnalyticsSummary["users"][number];
  onClose: () => void;
}) {
  const [kind, setKind] = useState<Kind>("turns"),
    [offset, setOffset] = useState(0),
    [job, setJob] = useState<string | null>(null);
  const [data, setData] = useState<Detail | null>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    let active = true;
    const timeout = setTimeout(() => abort.abort(), 25000);
    read<{ detail: Detail }>(
      `/api/admin/analytics?userId=${user.id}&kind=${job ? "material" : kind}&offset=${offset}${job ? `&opportunityId=${job}` : ""}`,
      abort.signal,
    )
      .then((r) => {
        if (active) setData(r.detail);
      })
      .catch((e) => {
        if (active)
          setError(
            e.name === "AbortError" ? "读取超时，可以重试。" : e.message,
          );
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      active = false;
      clearTimeout(timeout);
      abort.abort();
    };
  }, [user.id, kind, offset, job, retry]);
  const change = (next: Kind) => {
    setKind(next);
    setOffset(0);
    setJob(null);
    setData(null);
    setError("");
  };
  return (
    <section className={styles.userDetail} aria-label="用户详情">
      <div className={styles.detailHeader}>
        <div>
          <button className={styles.back} onClick={onClose}>
            返回用户列表
          </button>
          <h2>用户详情</h2>
          <code>{user.id}</code>
        </div>
        <p>
          {user.providerLabel} · 注册于 {date(user.created_at)}
          <br />
          区间事件 {user.eventCount} 条 · 可观测时长{" "}
          {duration(user.sessions ? user.seconds : null)}
        </p>
      </div>
      <p className={styles.note}>
        仅管理员只读。以下是当前保存材料，不受总览时间筛选；联系方式已遮蔽，长正文最多显示
        60,000 字。
      </p>
      <nav className={styles.detailTabs} aria-label="用户材料类型">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => change(t.id)}
            aria-current={kind === t.id ? "page" : undefined}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {job ? (
        <button
          className={styles.back}
          onClick={() => {
            setJob(null);
            setData(null);
            setError("");
          }}
        >
          返回岗位列表
        </button>
      ) : null}
      {error ? (
        <div role="alert" className={styles.error}>
          <p>{error}</p>
          <button
            onClick={() => {
              setError("");
              setData(null);
              setRetry((n) => n + 1);
            }}
          >
            重新读取
          </button>
        </div>
      ) : !data ? (
        <p role="status" className={styles.empty}>
          正在读取已保存记录…
        </p>
      ) : (
        <div key={`${kind}-${offset}-${job}`} className={styles.detailContent}>
          {!data.rows.length ? (
            <p className={styles.empty}>
              这里没有已保存的记录。其他类型可切换上方查看。
            </p>
          ) : null}
          {data.rows.map((r) => (
            <article key={r.id} className={styles.record}>
              {kind === "opportunities" ? (
                <>
                  <h3>
                    {r.company || "未命名公司"} · {r.role || "未命名岗位"}
                  </h3>
                  <p className={styles.note}>
                    更新 {date(r.updatedAt)}
                    {r.status ? ` · ${r.status}` : ""}
                  </p>
                  {job ? (
                    <div className={styles.materials}>
                      <details open>
                        <summary>
                          当前工作稿 · {r.changeCount || 0} 条修改
                        </summary>
                        {r.replacementIssues ? (
                          <p className={styles.note}>
                            有 {r.replacementIssues}{" "}
                            处修改未能准确定位，以下没有强行替换。
                          </p>
                        ) : null}
                        <pre>
                          {r.workingResume ||
                            "没有保存简历正文；未推测文件内容。"}
                        </pre>
                      </details>
                      <details>
                        <summary>简历原文</summary>
                        <pre>{r.sourceResume || "没有保存正文。"}</pre>
                      </details>
                      <details>
                        <summary>关联 JD</summary>
                        <pre>{r.jd || "没有绑定 JD。"}</pre>
                      </details>
                      {r.truncated ? (
                        <p className={styles.note}>
                          正文较长，已按上限截取；源资料未改动。
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <button
                      className={styles.action}
                      onClick={() => {
                        setJob(r.id);
                        setOffset(0);
                        setData(null);
                        setError("");
                      }}
                    >
                      查看简历与 JD
                    </button>
                  )}
                </>
              ) : (
                <>
                  <p className={styles.recordMeta}>
                    {date(r.createdAt)}
                    {r.opportunityId ? (
                      <>
                        {" "}
                        · 岗位 <code>{r.opportunityId}</code>
                      </>
                    ) : null}
                    {r.sessionId ? (
                      <>
                        {" "}
                        · 会话 <code>{r.sessionId}</code>
                      </>
                    ) : null}
                  </p>
                  {kind === "turns" ? (
                    <>
                      <div className={styles.userBubble}>
                        <span>用户</span>
                        <p>{r.question}</p>
                      </div>
                      <div className={styles.mentorBubble}>
                        <span>导师</span>
                        <TutorMarkdown>
                          {r.answer || "没有保存回复。"}
                        </TutorMarkdown>
                      </div>
                    </>
                  ) : kind === "legacyChat" ? (
                    <div
                      className={
                        r.role === "user"
                          ? styles.userBubble
                          : styles.mentorBubble
                      }
                    >
                      <span>{r.role === "user" ? "用户" : "导师"}</span>
                      <TutorMarkdown>{r.content || "没有正文。"}</TutorMarkdown>
                    </div>
                  ) : (
                    <>
                      <p className={styles.note}>
                        任务状态：{r.state} · 仅展示已保存讨论和补充
                      </p>
                      {r.question ? <p>当前补问：{r.question}</p> : null}
                      {r.answers?.map((a, i) => (
                        <details key={i}>
                          <summary>补充记录 · {date(a.savedAt)}</summary>
                          <p>{a.question}</p>
                          <p>{a.answer || "已跳过或无答复"}</p>
                        </details>
                      ))}
                      {r.conversation?.map((t) => (
                        <div key={t.id} className={styles.turn}>
                          <p className={styles.note}>
                            {date(t.savedAt)} · {t.status}
                          </p>
                          <div className={styles.userBubble}>
                            <span>用户</span>
                            <p>{t.message}</p>
                          </div>
                          <div className={styles.mentorBubble}>
                            <span>导师</span>
                            <TutorMarkdown>
                              {t.reply || "没有保存回复。"}
                            </TutorMarkdown>
                          </div>
                        </div>
                      ))}
                      {r.truncated ? (
                        <p className={styles.note}>
                          此任务仅显示最近 100 条讨论／补充。
                        </p>
                      ) : null}
                    </>
                  )}
                </>
              )}
            </article>
          ))}
          {data.truncated ? (
            <p className={styles.note}>
              本页正文已按单条 60,000 字／整页 300,000
              字截取，未显示部分不代表原资料为空。
            </p>
          ) : null}
          {!job ? (
            <div className={styles.pagination}>
              <button
                disabled={!offset}
                onClick={() => {
                  setOffset((n) => Math.max(0, n - 20));
                  setData(null);
                }}
              >
                上一页
              </button>
              <span>第 {offset / 20 + 1} 页</span>
              <button
                disabled={data.nextOffset === null}
                onClick={() => {
                  setOffset(data.nextOffset!);
                  setData(null);
                }}
              >
                下一页
              </button>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
export default function AnalyticsClient() {
  const [days, setDays] = useState(30),
    [tab, setTab] = useState("overview"),
    [data, setData] = useState<AnalyticsSummary | null>(null),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0);
  const [query, setQuery] = useState(""),
    [provider, setProvider] = useState("all"),
    [selected, setSelected] = useState<string | null>(null),
    [userPage, setUserPage] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    let active = true;
    const timeout = setTimeout(() => abort.abort(), 25000);
    read<{ summary: AnalyticsSummary }>(
      `/api/admin/analytics?days=${days}`,
      abort.signal,
    )
      .then((r) => {
        if (active) setData(r.summary);
      })
      .catch((e) => {
        if (active)
          setError(e.name === "AbortError" ? "读取超时，请重试。" : e.message);
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      active = false;
      clearTimeout(timeout);
      abort.abort();
    };
  }, [days, refresh]);
  const users = useMemo(
    () =>
      (data?.users || [])
        .filter(
          (u) =>
            u.id.toLowerCase().includes(query.toLowerCase()) &&
            (provider === "all" || (u.provider || "unknown") === provider),
        )
        .sort((a, b) =>
          (b.lastEventAt || b.created_at).localeCompare(
            a.lastEventAt || a.created_at,
          ),
        ),
    [data, query, provider],
  );
  const user = data?.users.find((u) => u.id === selected);
  const reload = (nextDays = days) => {
    setDays(nextDays);
    setData(null);
    setError("");
    setRefresh((n) => n + 1);
  };
  return (
    <div className={styles.app}>
      <a href="#analytics-main" className={styles.skip}>
        跳到数据正文
      </a>
      <header className={styles.topbar}>
        <Link href="/admin/evals" className={styles.brand}>
          益职 <span>/</span> Eval Lab
        </Link>
        <nav aria-label="管理后台">
          <Link href="/admin/evals">运行与评测</Link>
          <Link href="/admin/evals/analytics" aria-current="page">
            数据
          </Link>
          <Link href="/cockpit">返回工作区</Link>
        </nav>
      </header>
      <main id="analytics-main" className={styles.main}>
        <div className={styles.heading}>
          <div>
            <h1>产品数据</h1>
            <p>从使用情况，看到具体用户与材料。</p>
          </div>
          <div className={styles.toolbar}>
            <label>
              统计区间
              <select
                value={days}
                onChange={(e) => reload(Number(e.target.value))}
              >
                <option value={7}>近 7 天</option>
                <option value={30}>近 30 天</option>
                <option value={90}>近 90 天</option>
              </select>
            </label>
            <button onClick={() => reload()}>刷新数据</button>
          </div>
        </div>
        <nav className={styles.tabs} aria-label="数据视图">
          <button
            onClick={() => {
              setTab("overview");
              setSelected(null);
            }}
            aria-current={tab === "overview" ? "page" : undefined}
          >
            总览
          </button>
          <button
            onClick={() => setTab("users")}
            aria-current={tab === "users" ? "page" : undefined}
          >
            用户{data ? ` · ${data.totals.users}` : ""}
          </button>
          <span>
            北京时间 ·{" "}
            {data
              ? `${analyticsDay(data.window.start)} 起 · 更新 ${date(data.generatedAt)}`
              : "直接读取后台"}
          </span>
        </nav>
        {error ? (
          <div role="alert" className={styles.error}>
            <p>{error}</p>
            <button onClick={() => reload()}>重新读取</button>
            <Link href="/login?redirect=%2Fadmin%2Fevals%2Fanalytics">
              重新登录
            </Link>
          </div>
        ) : !data ? (
          <div role="status" className={styles.loading}>
            <h2>正在读取产品数据</h2>
            <p>核对访问记录、账户和注册批次…</p>
          </div>
        ) : tab === "overview" ? (
          <Overview data={data} />
        ) : user ? (
          <UserDetail
            key={user.id}
            user={user}
            onClose={() => setSelected(null)}
          />
        ) : (
          <section className={styles.userList}>
            <div className={styles.userFilters}>
              <label className={styles.search}>
                <span>用户 ID</span>
                <input
                  aria-label="用户 ID"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value.trim());
                    setUserPage(0);
                  }}
                  placeholder="输入完整 ID 或一部分"
                />
              </label>
              <label>
                注册方式
                <select
                  value={provider}
                  onChange={(e) => {
                    setProvider(e.target.value);
                    setUserPage(0);
                  }}
                >
                  <option value="all">全部方式</option>
                  {[...new Set(data.users.map((u) => u.provider || "unknown"))]
                    .sort()
                    .map((p) => (
                      <option key={p} value={p}>
                        {
                          data.users.find(
                            (u) => (u.provider || "unknown") === p,
                          )?.providerLabel
                        }
                      </option>
                    ))}
                </select>
              </label>
              <p>{users.length} 个账户 · 点击 ID 查看</p>
            </div>
            <div className={styles.scrollTable}>
              <table className={styles.usersTable}>
                <thead>
                  <tr>
                    <th>用户 ID</th>
                    <th>注册方式</th>
                    <th>注册时间</th>
                    <th>最近埋点</th>
                    <th>事件数</th>
                    <th>总可观测时长</th>
                  </tr>
                </thead>
                <tbody>
                  {users.slice(userPage * 20, (userPage + 1) * 20).map((u) => (
                    <tr key={u.id}>
                      <td>
                        <button
                          className={styles.userId}
                          onClick={() => setSelected(u.id)}
                        >
                          {u.id}
                        </button>
                      </td>
                      <td>{u.providerLabel}</td>
                      <td>{date(u.created_at)}</td>
                      <td>{date(u.lastEventAt)}</td>
                      <td>{u.eventCount}</td>
                      <td>{u.sessions ? duration(u.seconds) : "不可估算"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!users.length ? (
              <p className={styles.empty}>
                没有匹配的账户。可清空 ID 或切换注册方式。
              </p>
            ) : null}
            <div className={styles.pagination}>
              <button
                disabled={!userPage}
                onClick={() => setUserPage((n) => n - 1)}
              >
                上一页
              </button>
              <span>第 {userPage + 1} 页</span>
              <button
                disabled={(userPage + 1) * 20 >= users.length}
                onClick={() => setUserPage((n) => n + 1)}
              >
                下一页
              </button>
            </div>
            <p className={styles.note}>
              注册方式来自账户原记录；“未记录”不猜测。埋点、时长为所选区间；账户与已存材料不受时间筛选。
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
