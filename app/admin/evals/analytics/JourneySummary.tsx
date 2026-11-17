import type {AnalyticsSummary} from "@/lib/admin-analytics";

export default function JourneySummary({data}:{data:AnalyticsSummary["journeys"]}) {
  const rows=data.generations;
  return <section aria-label="入口与改稿记录关联">
    <h2>入口与改稿记录关联</h2>
    <p>首页：提交 {data.landing.submitted} → 展现回应 {data.landing.responded} → 点击继续 {data.landing.continued}。
      其中兜底回应 {data.landing.fallback}，不计作真实模型回应。</p>
    <p>同一版改稿：保存 {rows.filter(r=>r.persisted).length} · 打开 {rows.filter(r=>r.presented).length} ·
      作出修改决定 {rows.filter(r=>r.decisions>0).length} · 点击导出 {rows.filter(r=>r.exports>0).length}。</p>
    <p>{data.note} 点击继续不等于登录成功。各环节不是强制漏斗；所选日期外的动作不补算。
      未关联改稿的导出点击 {data.unlinkedExports} 次。</p>
    <details><summary>按生成编号查看链路</summary>
      {rows.length ? <ul>{rows.map(r=><li key={`${r.userId}:${r.generationId}`}>
        {r.generationId}：{r.started?"启动已记录":"启动未记录"} → {r.persisted?"保存已记录":"保存未记录"} →
        {r.presented?"打开已记录":"打开未记录"} · 修改决定 {r.decisions} 处 · 导出 {r.exports} 次 ·
        预览 {r.previews} 次 · 打印请求 {r.printRequests} 次 · 弹窗返回 {r.dialogReturns} 次
      </li>)}</ul>:<p>所选日期尚无可关联的改稿记录。</p>}
    </details>
  </section>;
}
