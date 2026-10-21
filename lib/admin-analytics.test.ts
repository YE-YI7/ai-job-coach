import {
  analyticsDay,
  analyticsWindow,
  buildAnalytics,
  estimateUsage,
  providerLabel,
  type AnalyticsEvent,
  type AnalyticsUser,
} from "./admin-analytics";
const window = analyticsWindow(7, new Date("2026-10-21T08:00:00Z"));
test("unknown event/provider labels cannot resolve object prototype members", () => {
  expect(providerLabel("__proto__")).toBe("__proto__");
  const data = buildAnalytics(
    [],
    [
      {
        id: "x",
        user_id: null,
        event_identity: "anon:x",
        event_name: "constructor",
        created_at: "2026-10-18T00:00:00Z",
      },
    ],
    window,
  );
  expect(data.features[0].label).toBe("constructor");
});
const event = (
  id: string,
  when: string,
  name = "workspace_saved",
  user = "u1",
  extras = {},
): AnalyticsEvent => ({
  id,
  user_id: user,
  event_identity: user,
  event_name: name,
  created_at: when,
  ...extras,
});
const user = (id: string, when = "2026-10-17T08:00:00Z"): AnalyticsUser => ({
  id,
  created_at: when,
  provider: null,
  last_active: "2026-10-21T08:00:00Z",
});
test("China natural days, current partial day and month boundaries", () => {
  expect(analyticsDay("2026-10-20T16:00:00Z")).toBe("2026-10-21");
  expect(window.start).toBe("2026-10-14T16:00:00.000Z");
  expect(analyticsWindow(30, new Date("2026-03-01T01:00:00Z")).start).toBe(
    "2026-01-30T16:00:00.000Z",
  );
});
test("mature registration cohorts only; last_active alone is not retention", () => {
  const data = buildAnalytics(
    [
      user("u1"),
      user("u2"),
      user("today", "2026-10-21T00:00:00Z"),
      user("yesterday", "2026-10-20T00:00:00Z"),
    ],
    [
      event("1", "2026-10-18T01:00:00Z"),
      event("2", "2026-10-19T01:00:00Z", "workspace_saved", "u2"),
      event("trace", "2026-10-18T01:00:00Z", "resume_agent_trace", "u2"),
    ],
    window,
  );
  expect(data.retention).toMatchObject({
    numerator: 1,
    denominator: 2,
    rate: 0.5,
    pending: 2,
  });
  expect(data.totals.activeUsers).toBe(2);
});
test("zero denominator and no observed usage stay unavailable, not zero percent", () => {
  const data = buildAnalytics([], [], window);
  expect(data.retention.rate).toBeNull();
  expect(data.usage.averageSeconds).toBeNull();
  expect(data.daily).toHaveLength(7);
});
test("duration caps individual gaps at 5m; >30m starts session; single event is 0", () => {
  expect(
    estimateUsage([
      event("1", "2026-10-18T00:00:00Z"),
      event("2", "2026-10-18T00:01:00Z"),
      event("3", "2026-10-18T00:11:00Z"),
      event("4", "2026-10-18T01:00:00Z"),
    ]),
  ).toEqual({
    seconds: 360,
    sessions: 2,
    singleEventSessions: 1,
    averageSeconds: 180,
  });
});
test("traffic is not all events, avoids double counting old and new page events", () => {
  const data = buildAnalytics(
    [user("u1")],
    [
      event("1", "2026-10-18T00:00:00Z", "page_viewed"),
      event("2", "2026-10-18T00:00:00Z", "cockpit_viewed"),
      event("3", "2026-10-18T00:01:00Z"),
      event("4", "2026-10-18T00:02:00Z", "page_viewed", "anon:a", {
        user_id: null,
      }),
    ],
    window,
  );
  expect(data.traffic).toMatchObject({
    pv: 2,
    uv: 2,
    mode: "unified",
    legacyPv: 1,
  });
  expect(data.daily[0].pv).toBeNull();
  expect(data.totals.activeUsers).toBe(1);
  expect(data.features.find((x) => x.name === "workspace_saved")).toMatchObject(
    { count: 1, users: 1 },
  );
});
test("known QA/internal/preview excluded consistently, unknown providers not invented", () => {
  const data = buildAnalytics(
    [user("u1"), user("internal"), user("configured")],
    [
      event("1", "2026-10-18T00:00:00Z", "page_viewed", "internal", {
        account_cohort: "internal",
      }),
      event("2", "2026-10-18T00:00:00Z", "page_viewed", "configured"),
      event("3", "2026-10-18T00:00:00Z", "page_viewed", "u1", { qa: "true" }),
      event("4", "2026-10-18T00:00:00Z", "page_viewed", "u1", {
        environment: "preview",
      }),
      event("5", "2026-10-18T00:00:00Z", "page_viewed", "u1", {
        source: "growth-qa-20261004",
      }),
    ],
    window,
    new Set(["configured"]),
  );
  expect(data.totals).toMatchObject({ users: 1, excludedEvents: 5 });
  expect(data.users[0].providerLabel).toBe("未记录");
});
test("UV distinct across days is not sum of daily UV; average weighted by sessions", () => {
  const data = buildAnalytics(
    [user("u1")],
    [
      event("1", "2026-10-18T00:00:00Z", "landing_viewed"),
      event("2", "2026-10-18T00:01:00Z"),
      event("3", "2026-10-19T00:00:00Z", "landing_viewed"),
    ],
    window,
  );
  expect(data.traffic).toMatchObject({ uv: 1, pv: 2, mode: "legacy" });
  expect(data.daily.reduce((n, r) => n + r.uv, 0)).toBe(2);
  expect(data.usage.averageSeconds).toBe(30);
});
