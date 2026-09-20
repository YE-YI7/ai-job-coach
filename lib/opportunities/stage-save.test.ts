import { commitStage, mergeStageResult } from "./stage-save";
import type { Opportunity } from "./types";

const opp = (over: Partial<Opportunity> = {}) =>
  ({ id: "o-1", company: "字节", role: "PM", stage: "applied", stageLabel: "已投递", ...over }) as Opportunity;

const list = [opp(), opp({ id: "o-2", stage: "evaluating", stageLabel: "评估中" })];

// 确认 ≠ 保存成功：云端岗位必须拿到 PATCH 的明确成功才改状态；失败回滚并可播报。
describe("commitStage（保存失败可见）", () => {
  it("云端保存成功：新状态生效，saved=true", async () => {
    const calls: Opportunity[] = [];
    const patch = async (o: Opportunity) => { calls.push(o); return { ok: true }; };
    const result = await commitStage({ opportunities: list, activeId: "o-1", stage: "interviewing", stageLabel: "面试中", isCloud: true, patch });
    expect(result.saved).toBe(true);
    expect(result.opportunities.find((o) => o.id === "o-1")!.stage).toBe("interviewing");
    expect(calls).toHaveLength(1);
    // PATCH 提交的是带新状态的整份岗位
    expect(calls[0]).toMatchObject({ id: "o-1", stage: "interviewing", stageLabel: "面试中" });
  });

  it("PATCH 返回 500 文案：状态回滚、saved=false、错误可播报", async () => {
    const result = await commitStage({
      opportunities: list, activeId: "o-1", stage: "won", stageLabel: "已 offer", isCloud: true,
      patch: async () => ({ ok: false, error: "岗位状态保存失败（500）" }),
    });
    expect(result.saved).toBe(false);
    expect(result.error).toContain("500");
    expect(result.opportunities.find((o) => o.id === "o-1")!.stage).toBe("applied");
    expect(result.opportunities).toBe(list); // 原样回滚，不是乐观更新
  });

  it("PATCH 抛网络异常：同样回滚且不抛出", async () => {
    const result = await commitStage({
      opportunities: list, activeId: "o-1", stage: "won", stageLabel: "已 offer", isCloud: true,
      patch: async () => { throw new TypeError("Failed to fetch"); },
    });
    expect(result.saved).toBe(false);
    expect(result.error).toBe("网络异常");
    expect(result.opportunities.find((o) => o.id === "o-1")!.stage).toBe("applied");
  });

  it("浏览器本地岗位（非云端）：直接生效，不发 PATCH", async () => {
    const patch = jest.fn();
    const result = await commitStage({ opportunities: list, activeId: "o-1", stage: "negotiating", stageLabel: "谈薪中", isCloud: false, patch });
    expect(result.saved).toBe(true);
    expect(patch).not.toHaveBeenCalled();
    expect(result.opportunities.find((o) => o.id === "o-1")!.stageLabel).toBe("谈薪中");
  });

  it("找不到岗位：不改动、不假装成功", async () => {
    const result = await commitStage({ opportunities: list, activeId: "nope", stage: "won", stageLabel: "已 offer", isCloud: true, patch: async () => ({ ok: true }) });
    expect(result.saved).toBe(false);
    expect(result.opportunities).toBe(list);
  });
});

describe("请求等待期间编辑或删除岗位", () => {
  it.each([true, false])("保存结果 %s 不覆盖等待期间的编辑或新增岗位", async (ok) => {
    let resolve!: (value: { ok: boolean }) => void;
    const saving = commitStage({ opportunities: list, activeId: "o-1", stage: "won", stageLabel: "已 offer", isCloud: true, patch: () => new Promise((r) => { resolve = r; }) });
    const current = [...list.map((o) => ({ ...o, resumeText: "请求期间的新正文" })), opp({ id: "new" })];
    resolve({ ok });
    const merged = mergeStageResult(current, await saving, "o-1");
    expect(merged).toHaveLength(3);
    expect(merged[0].resumeText).toBe("请求期间的新正文");
    expect(merged[0].stage).toBe(ok ? "won" : "applied");
    expect(merged[1]).toBe(current[1]);
    if (!ok) expect(merged).toBe(current);
  });
  it("请求期间删除的岗位不会被恢复", async () => {
    const result = await commitStage({ opportunities: list, activeId: "o-1", stage: "won", stageLabel: "已 offer", isCloud: true, patch: async () => ({ ok: true }) });
    expect(mergeStageResult([list[1]], result, "o-1")).toEqual([list[1]]);
  });
});
