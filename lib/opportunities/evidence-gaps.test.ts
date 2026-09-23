import { uncoverableGap } from "./evidence-gaps";
import type { RequirementEvidence } from "./types";

const req = (over: Partial<RequirementEvidence>): RequirementEvidence => ({
  id: "r-1",
  requirement: "需求",
  importance: "important",
  strength: "strong",
  evidence: "有证据",
  source: "简历",
  verified: true,
  ...over,
});

describe("uncoverableGap", () => {
  it("没有缺口时返回 null", () => {
    expect(uncoverableGap([req({}), req({ id: "r-2", importance: "critical" })])).toBeNull();
  });

  it("critical 缺证据优先于其他 missing", () => {
    const gap = uncoverableGap([
      req({ id: "any-missing", requirement: "普通缺失", strength: "missing" }),
      req({ id: "crit-unverified", requirement: "硬要求待核实", importance: "critical", strength: "unverified", verified: false }),
    ]);
    expect(gap?.id).toBe("crit-unverified");
  });

  it("critical missing 也算不可补齐", () => {
    const gap = uncoverableGap([req({ id: "crit-missing", importance: "critical", strength: "missing" })]);
    expect(gap?.id).toBe("crit-missing");
  });

  it("非 critical 的 missing 兜底触发", () => {
    const gap = uncoverableGap([
      req({ id: "ok", importance: "critical", strength: "weak" }),
      req({ id: "soft-missing", importance: "supporting", strength: "missing" }),
    ]);
    expect(gap?.id).toBe("soft-missing");
  });

  it("weak/unverified 非 critical 不触发", () => {
    expect(uncoverableGap([
      req({ strength: "weak" }),
      req({ id: "r-2", strength: "unverified", verified: false }),
    ])).toBeNull();
  });
});
