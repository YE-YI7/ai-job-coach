import type {AnalyticsEvent} from "./admin-analytics";

/** 每个环节分别计证据，不强行要求用户必须按某个顺序操作。 */
export function summarizeProductJourneys(events: AnalyticsEvent[]) {
  const landing = events.filter(e => e.journey_id);
  const journeyCount = (name:string) => new Set(landing.filter(e => e.event_name === name).map(e => e.journey_id)).size;
  const generations = new Map<string, AnalyticsEvent[]>();
  for (const e of events) {
    if (!e.user_id || !e.generation_id) continue;
    const key = `${e.user_id}:${e.generation_id}`;
    const rows = generations.get(key) || [];
    rows.push(e); generations.set(key, rows);
  }
  const rows = [...generations.values()].map(es => {
    const has = (name:string) => es.some(e => e.event_name === name);
    const exported = es.filter(e => e.export_id);
    return {
      generationId:es[0].generation_id!, userId:es[0].user_id!,
      started:has("resume_task_started"), presented:has("resume_result_presented"),
      persisted:has("resume_document_persisted"),
      decisions:new Set(es.filter(e => e.event_name === "resume_change_decided").map(e => e.change_id).filter(Boolean)).size,
      exports:new Set(exported.filter(e => e.event_name === "resume_export_clicked").map(e => e.export_id)).size,
      previews:new Set(exported.filter(e => e.event_name === "resume_preview_ready").map(e => e.export_id)).size,
      printRequests:new Set(exported.filter(e => e.event_name === "resume_print_requested").map(e => e.export_id)).size,
      dialogReturns:new Set(exported.filter(e => e.event_name === "resume_print_dialog_closed").map(e => e.export_id)).size,
    };
  });
  return {
    landing:{submitted:journeyCount("landing_message_submitted"),responded:journeyCount("landing_response_presented"),
      continued:journeyCount("landing_continued"),
      fallback:new Set(landing.filter(e => e.event_name === "landing_response_presented" && e.response_source === "fallback")
        .map(e => e.journey_id)).size},
    generations:rows,
    unlinkedExports:events.filter(e => e.event_name === "resume_export_clicked" && !e.generation_id).length,
    note:"按本账号生成编号关联；历史缺失不倒填。打印请求或弹窗关闭不代表PDF已保存。",
  };
}
