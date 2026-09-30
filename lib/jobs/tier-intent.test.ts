import {
  ANY_TIER_LABEL,
  parseTierIntent,
  readTierPreference,
  tierLabels,
  tiersFromValue,
  TIER_PREFERENCE_KEY,
  type TierPreferenceClaimLike,
} from "./tier-intent";

/* ----------------                档位抽取（用户原话）                ---------------- */

const tiersIn = (text: string) => parseTierIntent(text)?.tiers ?? null;

test("正面表态：想去大厂 / 只看创业公司", () => {
  expect(tiersIn("我想去大厂")).toEqual(["big_tech"]);
  expect(tiersIn("只看创业公司")).toEqual(["mid_small"]);
  expect(tiersIn("优先考虑独立融资的软件公司")).toEqual(["mid_small"]);
});

test("点名的几档一起接受：想进大厂或创业公司", () => {
  expect(tiersIn("想进大厂或创业公司")).toEqual(["big_tech", "mid_small"]);
});

test("反面表态自动取补集：不想去大厂 = 剩下两档都要", () => {
  expect(tiersIn("不想去大厂")).toEqual(["mid_small", "non_internet"]);
  expect(tiersIn("排除国企和事业单位")).toEqual(["big_tech", "mid_small"]);
});

test("正反面同时出现时按正面收敛：想创业公司、别推大厂", () => {
  expect(tiersIn("想找创业公司，别推荐大厂")).toEqual(["mid_small"]);
});

test("「都行」挨着具体档位 = 接受这些档；挨着公司规模 = 不限", () => {
  expect(tiersIn("创业公司和大厂都行")).toEqual(["big_tech", "mid_small"]);
  expect(tiersIn("公司规模不限")).toEqual([]);
  expect(tiersIn("什么公司都可以")).toEqual([]);
});

test("没有立场的词不认：大厂加班多吗 / 什么是大厂", () => {
  expect(parseTierIntent("大厂加班严重吗？")).toBeNull();
  expect(parseTierIntent("什么是头部互联网公司")).toBeNull();
});

test("同一档既想又不想 = 读不出来，不写偏好", () => {
  expect(parseTierIntent("想去大厂，但又不想去大厂")).toBeNull();
});

test("三档全排除 = 没有正向依据，不设档位", () => {
  expect(parseTierIntent("不想去大厂，也不看创业公司，传统行业也不考虑")).toBeNull();
});

test("空话不认：光说「都行」不指向公司", () => {
  expect(parseTierIntent("都行")).toBeNull();
  expect(parseTierIntent("")).toBeNull();
  expect(parseTierIntent("   ")).toBeNull();
});

test("英文说法也认", () => {
  expect(tiersIn("I want to join a big tech company")).toEqual(["big_tech"]);
  expect(tiersIn("looking for a startup")).toEqual(["mid_small"]);
});

test("抽取必须带原话出处，且截断不越界", () => {
  const intent = parseTierIntent("我想去大厂，因为平台大。")!;
  expect(intent.tiers).toEqual(["big_tech"]);
  expect(intent.excerpt).toContain("我想去大厂");
  expect(intent.excerpt.length).toBeLessThanOrEqual(200);
});

/* ----------------                 claim 取值与展示                 ---------------- */

test("档位名一律用名录口径；空数组读作「不限」", () => {
  expect(tierLabels(["big_tech"])).toBe("集团级大厂");
  expect(tierLabels([])).toBe(ANY_TIER_LABEL);
  expect(tierLabels(["non_internet", "big_tech"])).toBe("集团级大厂、非互联网行业用人方");
});

test("value 只认 {tiers:[枚举]}：脏数据一律当没有这条，绝不半信半疑去筛人", () => {
  expect(tiersFromValue({ tiers: ["mid_small"] })).toEqual(["mid_small"]);
  expect(tiersFromValue({ tiers: ["mid_small", "mid_small", "big_tech"] })).toEqual(["big_tech", "mid_small"]);
  expect(tiersFromValue({ tiers: [] })).toEqual([]);
  expect(tiersFromValue({ tiers: ["外包"] })).toBeNull();
  expect(tiersFromValue({ tiers: "big_tech" })).toBeNull();
  expect(tiersFromValue("big_tech")).toBeNull();
  expect(tiersFromValue(null)).toBeNull();
});

/* ----------------                生效值怎么读出来                ---------------- */

const claim = (over: Partial<TierPreferenceClaimLike> & { id: string }): TierPreferenceClaimLike => ({
  entityType: "preference",
  entityKey: TIER_PREFERENCE_KEY,
  status: "unverified",
  value: { tiers: ["big_tech"] },
  displayText: "目标公司档位：集团级大厂",
  sourceExcerpt: "我想去大厂",
  updatedAt: "2026-09-30T00:00:00Z",
  ...over,
});

test("没表过态 = 不限：不剔除任何岗位", () => {
  const state = readTierPreference([]);
  expect(state).toMatchObject({ effectiveTiers: [], origin: "unset", claimId: null, pending: null });
});

test("确认过的意向才生效，并带得回原话", () => {
  const state = readTierPreference([claim({ id: "a", status: "confirmed" })]);
  expect(state.effectiveTiers).toEqual(["big_tech"]);
  expect(state.origin).toBe("explicit");
  expect(state.sourceExcerpt).toBe("我想去大厂");
  expect(state.pending).toBeNull();
});

test("最新的已确认那条说话：旧的不算", () => {
  const state = readTierPreference([
    claim({ id: "old", status: "confirmed", value: { tiers: ["big_tech"] }, updatedAt: "2026-09-01T00:00:00Z" }),
    claim({ id: "new", status: "confirmed", value: { tiers: [] }, sourceExcerpt: "我在面板选了不限", updatedAt: "2026-09-20T00:00:00Z" }),
  ]);
  expect(state).toMatchObject({ effectiveTiers: [], origin: "explicit", claimId: "new" });
});

test("没确认的意向不生效，但要提示出来（带原话）", () => {
  const state = readTierPreference([claim({ id: "p", sourceExcerpt: "不想去大厂" })]);
  expect(state.effectiveTiers).toEqual([]);
  expect(state.origin).toBe("unset");
  expect(state.pending).toEqual({ claimId: "p", tiers: ["big_tech"], excerpt: "不想去大厂" });
});

test("确认之后又被对话里的新话盖住：新意向重新变成待确认", () => {
  const state = readTierPreference([
    claim({ id: "c", status: "confirmed", value: { tiers: [] }, updatedAt: "2026-09-10T00:00:00Z" }),
    claim({ id: "u", value: { tiers: ["big_tech"] }, updatedAt: "2026-09-20T00:00:00Z" }),
  ]);
  expect(state.effectiveTiers).toEqual([]);
  expect(state.pending?.claimId).toBe("u");
});

test("已被覆盖的旧意向不再提示", () => {
  const state = readTierPreference([
    claim({ id: "u", value: { tiers: ["big_tech"] }, updatedAt: "2026-09-01T00:00:00Z" }),
    claim({ id: "c", status: "confirmed", value: { tiers: ["mid_small"] }, updatedAt: "2026-09-10T00:00:00Z" }),
  ]);
  expect(state.pending).toBeNull();
  expect(state.effectiveTiers).toEqual(["mid_small"]);
});

test("撤回的、别处的、脏值的记录都不参与判定", () => {
  const state = readTierPreference([
    claim({ id: "w", status: "withdrawn", updatedAt: "2026-09-30T00:00:00Z" }),
    claim({ id: "other", entityType: "experience", entityKey: "something_else", status: "confirmed" }),
    claim({ id: "bad", value: { tiers: ["外包"] }, status: "confirmed" }),
  ]);
  expect(state).toMatchObject({ effectiveTiers: [], origin: "unset", pending: null });
});
