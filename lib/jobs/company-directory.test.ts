import {
  COMPANY_TIERS,
  indexCompanyDirectory,
  loadCompanyDirectory,
  parseCompanyDirectory,
  CompanyDirectoryError,
  TIER_LABEL,
  type CompanyDirectoryRecord,
} from "./company-directory";

const record = (over: Partial<CompanyDirectoryRecord> = {}): CompanyDirectoryRecord => ({
  name: "示例科技",
  domain: "shili.com",
  tier: "mid_small",
  aliases: ["shili"],
  identityConfirmed: true,
  identityBasis: "招聘板页面标题写明法人名。",
  tierBasis: "公开融资报道，单一产品线创业公司。",
  reviewAt: "2026-12-31",
  sources: [{ url: "https://example.com/news", title: "融资报道", publishedAt: "2026-07-01" }],
  ...over,
});
const entry = (over: Record<string, unknown> = {}) => ({ ...record(), ...over });

/* ----------------            真数据：入库就有出处            ---------------- */

test("线上名录装载得起来，每条都有公开出处与复核日期", () => {
  const directory = loadCompanyDirectory();
  expect(directory.records.length).toBeGreaterThan(0);
  expect(/^\d{4}-\d{2}-\d{2}$/.test(directory.verifiedAt)).toBe(true);
  for (const item of directory.records) {
    expect(COMPANY_TIERS).toContain(item.tier);
    expect(TIER_LABEL[item.tier].length).toBeGreaterThan(0);
    expect(item.sources.length).toBeGreaterThan(0);
    for (const source of item.sources) expect(source.url.startsWith("https://")).toBe(true);
    expect(/^\d{4}-\d{2}-\d{2}$/.test(item.reviewAt)).toBe(true);
    // 自称已核身份就必须写依据，否则核验只能按「拿不准」处理
    if (item.identityConfirmed) expect(item.identityBasis.length).toBeGreaterThan(0);
    expect(item.tierBasis.length).toBeGreaterThan(0);
  }
});

test("名录覆盖当前两个招聘源的公司，层次与身份都可回查", () => {
  const directory = loadCompanyDirectory();
  for (const name of ["Meshy", "Kong"]) {
    const hit = directory.lookup(name);
    expect(hit).not.toBeNull();
    expect(hit?.identityConfirmed).toBe(true);
    expect(directory.recordFor(name)?.sources.length).toBeGreaterThan(1);
  }
  // 如实记录现状：两条都是独立融资公司，名录里还没有大厂档
  expect(loadCompanyDirectory().records.every((r) => r.tier === "mid_small")).toBe(true);
});

/* ----------------            查询纪律：宁可拿不准            ---------------- */

test("大小写、法人全称、别名都认得；域名不匹配就不认", () => {
  const directory = indexCompanyDirectory([record()], "2026-09-30");
  expect(directory.lookup("示例科技")?.tier).toBe("mid_small");
  expect(directory.lookup("SHILI")?.name).toBe("示例科技");
  expect(directory.lookup("示例科技", "shili.com")).not.toBeNull();
  // 同名但域名对不上：不许把两个法人合并成一条层次结论
  expect(directory.lookup("示例科技", "other-corp.com")).toBeNull();
  expect(directory.lookup("没听过的公司")).toBeNull();
});

test("同名两条法人：只按名字查作废（拿不准），域名给全仍能精确命中", () => {
  const directory = indexCompanyDirectory(
    [record(), record({ domain: "shili.co.kr", tier: "non_internet", sources: [{ url: "https://k.example/news", title: "另一家的报道", publishedAt: null }] })],
    "2026-09-30",
  );
  expect(directory.lookup("示例科技")).toBeNull();
  expect(directory.recordFor("示例科技")).toBeNull();
  expect(directory.lookup("示例科技", "shili.com")?.tier).toBe("mid_small");
  expect(directory.lookup("示例科技", "shili.co.kr")?.tier).toBe("non_internet");
});

/* ----------------            数据坏了要炸，不要静默            ---------------- */

test("层次不认识 / 没有出处 / 明文 http / 自称已核却没依据：一律拒绝装载", () => {
  expect(() => parseCompanyDirectory({ entries: [entry({ tier: "unicorn" })] })).toThrow(CompanyDirectoryError);
  expect(() => parseCompanyDirectory({ entries: [entry({ sources: [] })] })).toThrow(/没有公开证据链接/);
  expect(() => parseCompanyDirectory({ entries: [entry({ sources: [{ url: "http://example.com", title: "明文链接", publishedAt: null }] })] })).toThrow(/https/);
  expect(() => parseCompanyDirectory({ entries: [entry({ identityConfirmed: true, identityBasis: "" })] })).toThrow(/没写依据/);
  expect(() => parseCompanyDirectory({ entries: [entry({ tierBasis: "" })] })).toThrow(/没有依据/);
  expect(() => parseCompanyDirectory({ entries: [entry({ reviewAt: "年底" })] })).toThrow(/reviewAt/);
  expect(() => parseCompanyDirectory({ nope: 1 })).toThrow(/entries/);
});

test("跨记录撞名重复登记要报错，同一条记录里 name 与别名撞上不算", () => {
  expect(() => parseCompanyDirectory({ entries: [entry(), entry({ domain: "shili.com", tier: "big_tech" })] })).toThrow(/重复登记/);
  expect(() => parseCompanyDirectory({ entries: [entry({ aliases: ["示例科技", "shili"] })] })).not.toThrow();
});
