import { createElement, useEffect } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { useTodayCompanion } from "./useTodayCompanion";
import { readFileSync } from "node:fs";

type Props = Parameters<typeof useTodayCompanion>[0];
type Snapshot = ReturnType<typeof useTodayCompanion>;
const task = (goalTitle: string) => ({ goalTitle, step: { title: "整理一段真实经历" }, action: "not_started" });
const response = (value: unknown, status = 200) => ({ ok: status === 200, status, json: async () => value }) as Response;
const plan = (goalTitle: string) => response({ ok: true, plan: { companion: task(goalTitle) } });
const empty = () => response({ ok: true, plan: null });
const deferred = () => {
  let resolve!: (value: Response) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Response>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

describe("Today companion: actual mounted effects with deferred HTTP", () => {
  let root: ReactTestRenderer;
  let snapshot: Snapshot;
  const originalFetch = global.fetch;
  function Harness(props: Props) {
    const value = useTodayCompanion(props);
    useEffect(() => { snapshot = value; }, [value]);
    return null;
  }
  async function mount(props: Props) {
    await act(async () => { root = create(createElement(Harness, props)); });
  }
  async function update(props: Props) {
    await act(async () => { root.update(createElement(Harness, props)); });
  }
  afterEach(() => { if (root) act(() => root.unmount()); global.fetch = originalFetch; });

  test("loading render does not cancel its own delayed success", async () => {
    const pending = deferred();
    global.fetch = jest.fn(() => pending.promise);
    await mount({ scope: "none", enabled: true });
    expect(snapshot.status).toBe("loading");
    await act(async () => { pending.resolve(plan("独立求职目标")); });
    expect(snapshot).toMatchObject({ status: "present", scope: "none", companion: { goalTitle: "独立求职目标" } });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test.each([401, 503])("HTTP %s shows an error, explicit retry recovers", async status => {
    global.fetch = jest.fn().mockResolvedValueOnce(response({ ok: false }, status)).mockResolvedValueOnce(empty());
    await mount({ scope: "none", enabled: true });
    expect(snapshot.status).toBe("error");
    await update({ scope: "none", enabled: true, revision: 1 });
    expect(snapshot.status).toBe("absent");
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test("network failure is recoverable without an automatic retry", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("offline"));
    await mount({ scope: "none", enabled: true });
    expect(snapshot.status).toBe("error");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test("unmount/remount ignores a late first response", async () => {
    const old = deferred(), fresh = deferred();
    global.fetch = jest.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    await mount({ scope: "none", enabled: true });
    act(() => root.unmount());
    await mount({ scope: "none", enabled: true });
    await act(async () => { fresh.resolve(plan("新的读取")); old.resolve(plan("旧的读取")); });
    expect(snapshot.companion?.goalTitle).toBe("新的读取");
  });

  test("job with no plan falls back to explicit none, not the active job", async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(empty()).mockResolvedValueOnce(plan("无岗位目标"));
    await mount({ scope: "job-B", enabled: true, fallback: true });
    expect(snapshot).toMatchObject({ status: "present", scope: "none" });
    expect((global.fetch as jest.Mock).mock.calls.map(call => call[0])).toEqual([
      "/api/coach/companion?opportunityId=job-B", "/api/coach/companion?opportunityId=none",
    ]);
  });

  test("switch A to B fences old A data even if B fails", async () => {
    const pending = deferred();
    global.fetch = jest.fn().mockResolvedValueOnce(plan("A目标")).mockReturnValueOnce(pending.promise);
    await mount({ scope: "A", enabled: true });
    expect(snapshot.companion?.goalTitle).toBe("A目标");
    await update({ scope: "B", enabled: true });
    expect(snapshot.companion).toBeNull();
    await act(async () => { pending.reject(new Error("B offline")); });
    expect(snapshot).toMatchObject({ status: "error", companion: null, scope: null });
  });

  test("same-scope refresh failure retains only that scope's confirmed arrangement", async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(plan("A目标")).mockRejectedValueOnce(new Error("offline"));
    await mount({ scope: "A", enabled: true });
    await update({ scope: "A", enabled: true, revision: 1 });
    expect(snapshot).toMatchObject({ status: "error", scope: "A", companion: { goalTitle: "A目标" } });
  });

  test("disabled views do not contact the API", async () => {
    global.fetch = jest.fn();
    await mount({ scope: "none", enabled: false });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

test("Today excludes the resume editor and carries an explicit unscoped mentor target", () => {
  const app = readFileSync("components/cockpit/CockpitApp.tsx", "utf8");
  const today = readFileSync("components/cockpit/TodayWorkspace.tsx", "utf8");
  expect(app).toContain('resumeContext={surface === "opportunity"');
  expect(app).toContain('surface === "opportunity" && active &&');
  expect(app).toContain("setTodayMentorScope(opportunityId)");
  expect(app).toContain('surface === "today" && todayMentorScope !== undefined');
  expect(today).toContain("opportunityId={arrangementScopeId}");
  expect(today).not.toContain("arrangementScopeId ?? scopeId");
});
