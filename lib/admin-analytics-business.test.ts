import { accountAge, businessDaily, businessUsers, businessWindow, groupSessions, paginate, paymentStatus, sameOwner, observedUseSeconds, countMessages, isBusinessActivityEvent, isKnownBusinessEvent, eventLabel, type BusinessAccount, type BusinessTurn } from "./admin-analytics-business";
import type { AnalyticsEvent } from "./admin-analytics";

const event = (id: string, time: string, name = "page_viewed", user = "u1", extra: Partial<AnalyticsEvent> = {}): AnalyticsEvent => ({ id, created_at: time, event_name: name, user_id: user, event_identity: user, ...extra });
const account = (id: string, createdAt: string | null, provider: string | null = "phone"): BusinessAccount => ({ id, createdAt, provider });

test("business diagnostics are recognized without inflating user activity on the stable production base", () => {
  for (const name of ["resume_agent_trace", "resume_task_started", "resume_task_outcome", "resume_result_presented", "resume_change_decided", "resume_document_persisted"]) {
    expect(isKnownBusinessEvent(name)).toBe(true);
    expect(isBusinessActivityEvent(event(name, "2026-10-22T02:00:00Z", name))).toBe(false);
    expect(eventLabel(name)).not.toBe(name);
  }
  expect(isKnownBusinessEvent("unrecognized_event")).toBe(false);
  expect(isBusinessActivityEvent(event("real", "2026-10-22T02:00:00Z", "page_viewed"))).toBe(true);
});

test("shanghai midnight bounds a single day and rejects the future or an oversized range", () => {
  const now = new Date("2026-10-22T01:30:00Z");
  const today = businessWindow("2026-10-22", "2026-10-22", now);
  expect(today.start).toBe("2026-10-21T16:00:00.000Z");
  expect(today.end).toBe(now.toISOString());
  const yesterday = businessWindow("2026-09-30", "2026-10-01", now);
  expect(yesterday.end).toBe("2026-10-01T16:00:00.000Z");
  expect(() => businessWindow("2026-10-23", "2026-10-23", now)).toThrow("invalid_date");
  expect(() => businessWindow("2026-01-01", "2026-08-01", now)).toThrow("analytics_capacity");
});

test("a user is new on the registration day and old the next day", () => {
  const person = account("u1", "2026-10-21T16:30:00Z");
  expect(accountAge(person, "2026-10-22")).toBe("new");
  expect(accountAge(person, "2026-10-23")).toBe("old");
  expect(accountAge(account("u2", null, null), "2026-10-22")).toBe("unknown");
});

test("registration without activity stays visible, and duration is per active user", () => {
  const now = new Date("2026-10-22T08:00:00Z");
  const window = businessWindow("2026-10-22", "2026-10-22", now);
  const result = businessDaily(
    [account("u1", "2026-10-22T02:00:00Z"), account("quiet", "2026-10-22T03:00:00Z"), account("owner", "2026-10-01T00:00:00Z")],
    [
      event("a", "2026-10-22T02:00:00Z", "page_viewed", "u1"),
      event("b", "2026-10-22T02:02:00Z", "page_viewed", "u1"),
      event("c", "2026-10-22T02:10:00Z", "coach_response_failed", "u1"),
      event("d", "2026-10-22T02:00:00Z", "page_viewed", "owner"),
      event("e", "2026-10-22T02:00:00Z", "resume_agent_trace", "u1"),
    ],
    window,
    new Set(["owner"]),
  );
  expect(result.rows[0]).toMatchObject({ registered: 2, activeUsers: 1, failedReplies: 1, replies: 0 });
  expect(result.rows[0].averageUseSeconds).toBe(420);
  expect(result.coverage.excludedEvents).toBe(1);
});

test("pagination uses the full filtered set, and sessions do not invent links", () => {
  expect(paginate([1, 2, 3, 4, 5], 2, 2)).toEqual({ rows: [3, 4], total: 5, nextOffset: 4 });
  const window = businessWindow("2026-10-22", "2026-10-22", new Date("2026-10-22T10:00:00Z"));
  const turns: BusinessTurn[] = [
    { id: "1", userId: "u", sessionId: "s", requestId: "r", createdAt: "2026-10-22T02:00:00Z", role: "user", status: "sent", text: "问" },
    { id: "2", userId: "u", sessionId: "s", requestId: "r", createdAt: "2026-10-22T02:01:00Z", role: "user", status: "sent", text: "重试同一问" },
    { id: "3", userId: "u", sessionId: null, createdAt: "2026-10-22T03:00:00Z", role: "mentor", status: "failed", text: "失败" },
    { id: "4", userId: "u", sessionId: "other", createdAt: "2026-10-21T02:00:00Z", role: "user", status: "sent", text: "昨天" },
  ];
  const grouped = groupSessions(turns, window);
  expect(grouped.sessions).toHaveLength(1);
  expect(grouped.sessions[0].turns).toHaveLength(1);
  expect(grouped.unlinked?.label).toBe("未关联会话／旧记录");
  expect(groupSessions(turns, window, true).sessions.map((session) => session.id).sort()).toEqual(["other", "s"]);
});

test("points redemption and a positive balance are not a confirmed payment", () => {
  expect(paymentStatus({ creditedTransfer: true, positiveBalance: true, confirmedPayment: null })).toMatchObject({ states: ["points_redeemed", "positive_balance", "unknown"], paidFilterEnabled: false });
  expect(sameOwner("AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).toBe(true);
  expect(sameOwner("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")).toBe(false);
});
test("range cohort and equivalent timestamp boundary are not string comparisons",()=>{
 const w=businessWindow("2026-10-20","2026-10-22",new Date("2026-10-22T10:00:00Z"));
 expect(businessUsers([account("u1","2026-10-21T00:00:00Z")],[],w)[0].age).toBe("new");
 const single=businessWindow("2026-10-22","2026-10-22",new Date("2026-10-22T10:00:00Z"));
 expect(businessDaily([account("u1",null)],[event("start","2026-10-21T16:00:00+00:00")],single).rows[0].activeUsers).toBe(1);
});
test("duplicate response events are not saved rounds; saved question and answer deduplicate",()=>{
 const w=businessWindow("2026-10-22","2026-10-22",new Date("2026-10-22T10:00:00Z"));
 expect(businessDaily([], [event("a","2026-10-22T01:00:00Z","coach_response_received"),event("b","2026-10-22T01:00:00Z","coach_response_received")],w).rows[0].completedRounds).toBe(0);
 const t:BusinessTurn={id:"one",userId:"u",sessionId:"s",requestId:"r",createdAt:"2026-10-22T01:00:00Z",role:"user",status:"sent",text:"问"};
 expect(countMessages([t,{...t,id:"retry"},{...t,id:"reply",role:"mentor",status:"replied",text:"答"}])).toEqual({sent:1,replies:1,completed:1});
});
test("cross-midnight observed gaps are apportioned, and asOf stays frozen",()=>{
 const events=[event("a","2026-10-21T15:58:00Z"),event("b","2026-10-21T16:02:00Z")];
 expect(observedUseSeconds(events,"2026-10-21").seconds).toBe(120);expect(observedUseSeconds(events,"2026-10-22").seconds).toBe(120);
 const w=businessWindow("2026-10-22","2026-10-22",new Date("2026-10-22T10:00:00Z"),"2026-10-22T09:00:00Z");expect(w.end).toBe("2026-10-22T09:00:00.000Z");
});
