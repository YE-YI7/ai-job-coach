import { classifyResumeDelivery, countNewResumeChanges, deliveryFromTask, prepareClientDeliveryEvent, isServerResumeEvent } from "./resume-delivery";
import { summarizeResumeDelivery, type AnalyticsEvent } from "../admin-analytics";

const generation = "12345678-1234-4234-9234-123456789abc:4";
const previous = [{ id: "old" }];
const fresh = [{ id: "new" }];

test("invalid, empty and rejected model output is not a delivery", () => {
  for (const reasonCode of ["model_response_incomplete", "resume_review_unavailable", "resume_document_review_failed"]) {
    const receipt = classifyResumeDelivery({ taskState: "failed", persisted: false, newChangeCount: 0, reasonCode, generationId: generation });
    expect(receipt.outcome).toBe("failed");
    expect(receipt.persistence).not.toBe("confirmed");
  }
});

test("a saved safe change plus one follow-up is partial, and a question alone is not a delivery", () => {
  expect(classifyResumeDelivery({ taskState: "ready", persisted: true, newChangeCount: 1, hasFollowUp: true, generationId: generation })).toMatchObject({ outcome: "partial_delivered", persistence: "confirmed", deliveredCount: 1 });
  expect(classifyResumeDelivery({ taskState: "needs_detail", persisted: false, newChangeCount: 0, hasFollowUp: true })).toMatchObject({ outcome: "needs_detail", persistence: "not_persisted" });
  expect(classifyResumeDelivery({ taskState: "ready", persisted: true, unchanged: true, newChangeCount: 0, hasFollowUp: false })).toMatchObject({ outcome: "unchanged" });
});

test("previously retained changes are not counted as this generation", () => {
  expect(countNewResumeChanges(previous, [...previous, ...fresh])).toBe(1);
  expect(countNewResumeChanges(undefined, fresh)).toBeNull();
  expect(deliveryFromTask({ state: "ready", question: null, result: { changes: fresh, resumeGenerationId: generation, unchanged: false } }).outcome).toBe("unknown");
});

test("a committed generation stays readable when a later response fails, and a missing finish is unconfirmed", () => {
  const saved = deliveryFromTask({ state: "ready", question: null, result: { changes: fresh, previousChanges: previous, resumeGenerationId: generation } }, { generationId: generation, reasonCode: "request_failed" });
  expect(saved).toMatchObject({ outcome: "delivered", persistence: "confirmed" });
  expect(classifyResumeDelivery({ taskState: "running", persisted: false, traceFinishMissing: true, generationId: generation }).outcome).toBe("unconfirmed");
  expect(classifyResumeDelivery({ persisted: false, returnedWithoutOpportunity: true, newChangeCount: 1 }).persistence).toBe("returned_only");
  expect(classifyResumeDelivery({ quotaDenied: true, persisted: false }).outcome).toBe("quota_denied");
  expect(classifyResumeDelivery({ blocked: true, reasonCode: "cas_conflict", persisted: false }).outcome).toBe("blocked");
});

test("client events cannot assert a server save, and material text is dropped", () => {
  expect(isServerResumeEvent("resume_task_outcome")).toBe(true);
  expect(prepareClientDeliveryEvent("resume_task_outcome", "fixture-12345678", {})).toEqual({ error: "事件不属于交付回执" });
  const presented = prepareClientDeliveryEvent("resume_result_presented", "another-client-event-id", { generation_id: generation, resumeText: "真实简历原文" });
  expect(presented).toMatchObject({ properties: { schema_version: 2, generation_id: generation } });
  if ("properties" in presented) expect(presented.properties).not.toHaveProperty("resumeText");
  expect(prepareClientDeliveryEvent("entry_submitted", "fixture-12345678", { entry_kind: "one_sentence", page_category: "/cockpit", request_id: "12345678-1234-4234-9234-123456789abc", resumeText: "困惑原文" })).toMatchObject({ properties: { entry_kind: "one_sentence" } });
});

test("delivery totals use one generation once and leave old generation events out", () => {
  const row = (id: string, name: string, extra: Partial<AnalyticsEvent>): AnalyticsEvent => ({ id, user_id: "u", event_identity: "u", event_name: name, created_at: "2026-10-22T00:00:00Z", schema_version: "2", generation_id: generation, ...extra });
  const report = summarizeResumeDelivery([
    row("1", "resume_task_started", {}),
    row("2", "resume_task_started", {}),
    row("3", "resume_task_outcome", { delivery_outcome: "delivered", persistence: "confirmed" }),
    row("4", "resume_task_outcome", { delivery_outcome: "failed", persistence: "not_persisted" }),
    row("5", "resume_generation_completed", { schema_version: undefined }),
    row("6", "resume_result_presented", {}),
    row("7", "resume_result_presented", {}),
    { id: "8", user_id: "u", event_identity: "u", event_name: "resume_task_started", created_at: "2026-10-22T00:01:00Z", schema_version: "2", generation_id: "12345678-1234-4234-9234-123456789abd:1" },
  ]);
  expect(report.attemptsStarted).toBe(2);
  expect(report.outcomes.delivered).toBe(0);
  expect(report.outcomes.unconfirmed).toBe(2);
  expect(report.retrievableComplete).toBe(0);
  expect(report.presented).toBe(1);
  expect(report.note).toContain("不与本口径相加");
});

test('stale generations, repeated IDs and fresh starts cannot become delivered',()=>{
  expect(countNewResumeChanges(previous,[...fresh,...fresh])).toBe(1);
  expect(deliveryFromTask({state:'failed',result:{changes:fresh,previousChanges:[],resumeGenerationId:generation,unchanged:true}},{generationId:generation+'1',persisted:false,reasonCode:'request_failed'}).outcome).toBe('failed');
  expect(classifyResumeDelivery({taskState:'running',persisted:false}).outcome).toBe('running');
  expect(classifyResumeDelivery({persisted:true,newChangeCount:2,hasUnresolved:true}).outcome).toBe('partial_delivered');
  const event={id:'a',user_id:'u',event_identity:'u',event_name:'resume_task_started',created_at:new Date().toISOString(),schema_version:2,generation_id:generation};
  expect(summarizeResumeDelivery([event,{...event,id:'b'}]).outcomes).toMatchObject({running:1,unconfirmed:0});
});
test('entry submission and generation-specific decisions remain correlated without raw text',()=>{
  const submitted=prepareClientDeliveryEvent('entry_submitted','fixture-12345678',{entry_kind:'one_sentence',submission_id:'submission-12345678',message:'private'});
  expect(submitted).toMatchObject({properties:{submission_id:'submission-12345678'}});
  expect(prepareClientDeliveryEvent('entry_submitted','fixture-12345678',{entry_kind:'one_sentence'})).toHaveProperty('error');
  const a=prepareClientDeliveryEvent('resume_change_decided','fixture-12345678',{generation_id:generation,change_id:'x'.repeat(80),decision:'accept'});
  const b=prepareClientDeliveryEvent('resume_change_decided','fixture-12345678',{generation_id:generation+'1',change_id:'x'.repeat(80),decision:'accept'});
  expect(a).not.toEqual(b);
});
