import {
  decisionClaimRow, decisionEntityKey, decisionForUrl, decisionFromValue, isStaleMaterials, parseDecisionInput,
} from "./job-decision";

/**
 * 决定这一层只有四件事要守：三种立场之外不收；决定属于哪一批哪份材料必须成立；
 * 岗位身份按来源链接归位；读不回的半截决定宁可当没表过态。
 * 「暂不考虑」不能变成永久偏好是契约层的约束，不在这里断言（那条路根本不在本文件里）。
 */
const RUN = "3f1a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8";
const V = "a".repeat(64);
const valid = (over: Record<string, unknown> = {}) => ({
  jobId: "job-07", url: "https://boards.example.com/jobs/product-07", company: "示例科技",
  title: "产品实习生", location: "上海", decision: "not_now", reason: "方向不对",
  batchRunId: RUN, materialsVersion: V, ...over,
});

test("三种立场都要带齐岗位、批次和材料版本才收", () => {
  const parsed = parseDecisionInput(valid({ decision: "advance", reason: null }));
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return;
  expect(parsed.input).toEqual({
    jobId: "job-07", url: "https://boards.example.com/jobs/product-07", company: "示例科技",
    title: "产品实习生", location: "上海", decision: "advance", reason: null,
    batchRunId: RUN, materialsVersion: V,
  });
});

test("缺哪一项就点名哪一项，一条都不写", () => {
  const rejects: [Record<string, unknown>, string][] = [
    [{ url: "" }, "缺来源链接"],
    [{ url: "boards.example.com/jobs/1" }, "缺来源链接"],
    [{ url: "javascript:alert(1)" }, "不是网页地址"],
    [{ jobId: "" }, "哪条岗位"],
    [{ company: "   " }, "哪条岗位"],
    [{ title: "" }, "哪条岗位"],
    [{ decision: "already_applied" }, "只认"],
    [{ decision: "以后别推荐销售" }, "只认"],
    [{ batchRunId: "run-1" }, "缺推荐批次号"],
    [{ batchRunId: null }, "缺推荐批次号"],
    [{ materialsVersion: "short" }, "缺当前材料版本"],
    [{ materialsVersion: 1234 }, "缺当前材料版本"],
    [{ reason: { text: "方向不对" } }, "原因要写成一句话"],
  ];
  for (const [over, phrase] of rejects) {
    const parsed = parseDecisionInput(valid(over));
    expect(`${JSON.stringify(over)} → ${parsed.ok ? "收了" : parsed.error}`).toContain(phrase);
  }
});

test("原因可写可不写，过长只裁显示用的那句原话", () => {
  const bare = parseDecisionInput(valid({ reason: undefined }));
  expect(bare.ok && bare.input.reason).toBeNull();
  const long = parseDecisionInput(valid({ reason: "方".repeat(400) }));
  expect(long.ok && long.input.reason).toHaveLength(200);
});

test("同一岗位带锚点或尾斜杠算同一条，改了查询参数就是另一条", () => {
  const base = decisionEntityKey("https://example.com/jobs/7");
  expect(decisionEntityKey("https://example.com/jobs/7/")).toBe(base);
  expect(decisionEntityKey("https://example.com/jobs/7#apply")).toBe(base);
  expect(decisionEntityKey("https://example.com/jobs/7?lang=zh")).not.toBe(base);
});

test("落库形状：一行人能读的说法 + 完整的决定值", () => {
  const parsed = parseDecisionInput(valid());
  if (!parsed.ok) throw new Error("这份入参本该收");
  const row = decisionClaimRow(parsed.input);
  expect(row.entityKey).toBe(`job_decision:${RUN}:https://boards.example.com/jobs/product-07`);
  expect(row.claimType).toBe("job_decision");
  expect(row.displayText).toBe("暂不考虑：示例科技 · 产品实习生");
  expect(row.sourceExcerpt).toBe("方向不对");
  expect(row.value).toMatchObject({ jobId: "job-07", batchRunId: RUN, materialsVersion: V });
});

test("半截决定读不回来，界面回到没表过态", () => {
  const savedAt = "2026-10-08T02:00:00.000Z";
  expect(decisionFromValue(valid(), "claim-1", savedAt)).toMatchObject({ claimId: "claim-1", decision: "not_now", savedAt });
  for (const value of [
    null, "not-an-object", {},
    valid({ decision: "maybe" }), valid({ batchRunId: "run-1" }), valid({ materialsVersion: "nope" }),
    valid({ jobId: "" }), valid({ url: "" }),
  ]) {
    expect(decisionFromValue(value, "claim-1", savedAt)).toBeNull();
  }
  expect(decisionFromValue(valid(), "claim-1", null)).toBeNull();
});

test("界面按链接找回自己表过的态；材料换版后旧决定仍在但要说明", () => {
  const decision = decisionFromValue(valid(), "claim-1", "2026-10-08T02:00:00.000Z")!;
  expect(decisionForUrl([decision], "https://boards.example.com/jobs/product-07/")?.claimId).toBe("claim-1");
  expect(decisionForUrl([decision], "https://boards.example.com/jobs/other")).toBeUndefined();
  expect(isStaleMaterials(decision, V)).toBe(false);
  expect(isStaleMaterials(decision, "b".repeat(64))).toBe(true);
  expect(isStaleMaterials(decision, null)).toBe(false);
});
