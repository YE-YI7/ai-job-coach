import { getDbClient } from "@/lib/db";
import { listTierPreferenceClaims, readUserTierPreference, recordTierIntentFromText, saveTierPreference } from "./repository";
jest.mock("@/lib/db");

/**
 * 档位偏好的读写都走 coach_claims 一张表。这里只验四件事：
 * 读的时候范围收得够紧（本人 + 这一类偏好 + 没撤回的），
 * 面板点选是「撤回旧的 + 写一条已确认」而不是删行，
 * 从原话抽到的意向只能落成待确认且不重复记，
 * 以及任何一步坏了都不能假装偏好已经生效。
 */
const TIER_KEY = "target_company_tiers";

function mockDb(options: { claims?: unknown[]; updateError?: unknown; insertError?: unknown } = {}) {
  const calls = { select: [] as unknown[][], eq: [] as string[][], neq: [] as string[][], insert: [] as Record<string, unknown>[], update: [] as Record<string, unknown>[] };
  let mode = "";
  let inserted: Record<string, unknown> = {};
  const rows = () => ({ data: options.claims ?? [], error: null });
  const chain: Record<string, jest.Mock> = {};
  const verb = (name: string, record: (args: unknown[]) => void, kind?: "select" | "update" | "insert") => {
    chain[name] = jest.fn((...args: unknown[]) => { if (kind) mode = kind; record(args); return chain; });
  };
  verb("select", (args) => calls.select.push(args), "select");
  verb("eq", (args) => calls.eq.push(args as string[]));
  verb("neq", (args) => calls.neq.push(args as string[]));
  verb("order", () => {});
  verb("limit", () => {});
  verb("insert", (args) => { inserted = args[0] as Record<string, unknown>; calls.insert.push(inserted); }, "insert");
  verb("update", (args) => calls.update.push(args[0] as Record<string, unknown>), "update");
  chain.single = jest.fn(() => Promise.resolve(
    options.insertError ? { data: null, error: options.insertError } : { data: { id: "claim-new", ...inserted }, error: null }));
  chain.maybeSingle = jest.fn(() => Promise.resolve(rows()));
  chain.then = jest.fn((resolve: (v: unknown) => unknown) => Promise.resolve(
    mode === "update" && options.updateError ? { data: null, error: options.updateError } : rows(),
  ).then(resolve));
  (getDbClient as jest.Mock).mockResolvedValue({ from: jest.fn(() => chain) });
  return calls;
}

const tierRow = (over: Record<string, unknown> = {}) => ({
  id: "claim-1", entity_type: "preference", entity_key: TIER_KEY, claim_type: "tier_preference",
  value: { tiers: ["big_tech"] }, display_text: "目标公司档位：集团级大厂", source_excerpt: "我想去大厂",
  status: "confirmed", updated_at: "2026-09-30T00:00:00Z", ...over,
});

beforeEach(() => jest.resetAllMocks());

test("读偏好只认本人这一类偏好，撤回过的不再参与", async () => {
  const db = mockDb();
  await listTierPreferenceClaims("owner");
  expect(db.eq).toEqual([["user_id", "owner"], ["entity_type", "preference"], ["entity_key", TIER_KEY]]);
  expect(db.neq).toEqual([["status", "withdrawn"]]);
});

test("面板点过的偏好直接生效，并留得住是从哪句来的", async () => {
  const db = mockDb({ claims: [tierRow()] });
  const state = await readUserTierPreference("owner");
  expect(state).toMatchObject({ effectiveTiers: ["big_tech"], origin: "explicit", sourceExcerpt: "我想去大厂" });
  expect(db.select[0][0]).toContain("entity_key");
});

test("面板改档位：旧的撤回、只新增一条已确认，不删行", async () => {
  const db = mockDb();
  await saveTierPreference("owner", ["mid_small"], "在找岗位面板点的选择");
  expect(db.update).toHaveLength(1);
  expect(db.update[0]).toMatchObject({ status: "withdrawn", migrated_from: "withdrawn:superseded" });
  expect(db.eq).toEqual([["user_id", "owner"], ["entity_type", "preference"], ["entity_key", TIER_KEY]]);
  expect(db.neq).toEqual([["status", "withdrawn"]]);
  expect(db.insert[0]).toMatchObject({
    user_id: "owner", entity_key: TIER_KEY, status: "confirmed", verification_level: "user_confirmed",
    value: { tiers: ["mid_small"] }, source_excerpt: "在找岗位面板点的选择",
    display_text: "目标公司档位：独立融资的互联网/软件公司",
  });
});

test("撤回旧偏好失败就是不保存，不能留下两条同时生效", async () => {
  const db = mockDb({ updateError: Error("db down") });
  await expect(saveTierPreference("owner", ["big_tech"], null)).rejects.toThrow("db down");
  expect(db.insert).toHaveLength(0);
});

test("对话原话抽到的意向落成待确认，并把原话留在出处里", async () => {
  const db = mockDb({ claims: [] });
  const claim = await recordTierIntentFromText({ userId: "owner", text: "我想去创业公司，不想进大厂" });
  expect(claim).not.toBeNull();
  expect(db.insert[0]).toMatchObject({
    status: "unverified", verification_level: "self_reported",
    value: { tiers: ["mid_small"] },
  });
  expect(db.insert[0].source_excerpt).toContain("我想去创业公司");
  expect(db.insert[0].display_text).toContain("我想去创业公司");
});

test("读不出立场的消息一个字都不写，也不去查库", async () => {
  const db = mockDb();
  expect(await recordTierIntentFromText({ userId: "owner", text: "大厂加班一般几点结束" })).toBeNull();
  expect(db.insert).toHaveLength(0);
  expect(db.select).toHaveLength(0);
});

test("已经生效或已经在核对里的同一意向，不重复记第二行", async () => {
  const effective = mockDb({ claims: [tierRow()] });
  expect(await recordTierIntentFromText({ userId: "owner", text: "我还是想去大厂" })).toBeNull();
  expect(effective.insert).toHaveLength(0);

  const pendingRow = tierRow({ id: "claim-pending", status: "unverified", updated_at: "2026-09-30T02:00:00Z" });
  const pending = mockDb({ claims: [pendingRow, tierRow({ id: "claim-old", status: "confirmed", value: { tiers: ["mid_small"] }, updated_at: "2026-09-30T01:00:00Z" })] });
  expect(await recordTierIntentFromText({ userId: "owner", text: "只投大厂" })).toBeNull();
  expect(pending.insert).toHaveLength(0);
});

test("换了说法就是新意向：该重新落成一条待确认", async () => {
  const db = mockDb({ claims: [tierRow()] });
  const claim = await recordTierIntentFromText({ userId: "owner", text: "想投国企或者事业单位" });
  expect(claim).not.toBeNull();
  expect(db.insert[0]).toMatchObject({ status: "unverified", value: { tiers: ["non_internet"] } });
});
