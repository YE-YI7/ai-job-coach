/**
 * 公司层次名录（FR-9 的数据侧）。
 *
 * 名录是 `runVerificationAgent` 唯一的判定输入：查得到且身份已双校验才给层次结论，
 * 查不到 / 身份拿不准 = 拿不准 = 保留（核验子 Agent 的既有取向，这里不改语义）。
 *
 * 真源是 `data/company-tier-directory.json`——每条都带公开证据链接与复核日期，
 * 没有出处的层次不入库。这里做的是装载与校验：数据写坏了要立刻炸出来，
 * 而不是静默降级成「所有公司都不认识」，后者会让 FR-9 看起来在跑其实什么都没核。
 */
import rawDirectory from "@/data/company-tier-directory.json";
import type { CompanyDirectoryEntry, CompanyTier, CompanyTierDirectory } from "@/lib/coach-harness/subagents/verification";

export const COMPANY_TIERS: readonly CompanyTier[] = ["big_tech", "mid_small", "non_internet"];

/** 给用户看的一句话层次名，与名录里的 tierRule 口径一致。 */
export const TIER_LABEL: Record<CompanyTier, string> = {
  big_tech: "集团级大厂",
  mid_small: "独立融资的互联网/软件公司",
  non_internet: "非互联网行业用人方",
};

export interface DirectorySource {
  url: string;
  title: string;
  publishedAt: string | null;
}

export interface CompanyDirectoryRecord extends CompanyDirectoryEntry {
  aliases: string[];
  identityBasis: string;
  tierBasis: string;
  reviewAt: string;
  sources: DirectorySource[];
  researchSources?: string[];
}

export class CompanyDirectoryError extends Error {
  constructor(detail: string) {
    super(`公司层次名录数据不合法：${detail}`);
    this.name = "CompanyDirectoryError";
  }
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

function parseSource(value: unknown, where: string): DirectorySource {
  if (!value || typeof value !== "object") throw new CompanyDirectoryError(`${where} 的证据不是对象`);
  const s = value as Record<string, unknown>;
  const url = str(s.url);
  // 只收 https 绝对链接：证据必须点得开，相对路径和明文 http 一律算写坏了
  if (!/^https:\/\//i.test(url)) throw new CompanyDirectoryError(`${where} 的证据链接不是 https：${url || "(空)"}`);
  const title = str(s.title);
  if (!title) throw new CompanyDirectoryError(`${where} 的证据没有标题`);
  const publishedAt = s.publishedAt === null ? null : str(s.publishedAt);
  if (publishedAt !== null && !/^\d{4}-\d{2}-\d{2}$/.test(publishedAt)) {
    throw new CompanyDirectoryError(`${where} 的证据日期不是 YYYY-MM-DD：${publishedAt}`);
  }
  return { url, title, publishedAt };
}

function parseEntry(value: unknown, index: number): CompanyDirectoryRecord {
  if (!value || typeof value !== "object") throw new CompanyDirectoryError(`第 ${index} 条不是对象`);
  const e = value as Record<string, unknown>;
  const where = `第 ${index} 条`;
  const name = str(e.name);
  if (!name) throw new CompanyDirectoryError(`${where} 缺 name`);
  const domain = str(e.domain);
  if (!domain) throw new CompanyDirectoryError(`${where}（${name}）缺 domain`);
  const tier = str(e.tier) as CompanyTier;
  if (!COMPANY_TIERS.includes(tier)) throw new CompanyDirectoryError(`${where}（${name}）的 tier 不认识：${str(e.tier) || "(空)"}`);
  if (typeof e.identityConfirmed !== "boolean") throw new CompanyDirectoryError(`${where}（${name}）的 identityConfirmed 不是布尔值`);
  const identityBasis = str(e.identityBasis);
  const tierBasis = str(e.tierBasis);
  // 身份结论没有依据 = 不敢自称已双校验；层次结论没有依据 = 不许入库
  if (e.identityConfirmed && !identityBasis) throw new CompanyDirectoryError(`${where}（${name}）自称身份已核但没写依据`);
  if (!tierBasis) throw new CompanyDirectoryError(`${where}（${name}）的层次结论没有依据`);
  const reviewAt = str(e.reviewAt);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reviewAt)) throw new CompanyDirectoryError(`${where}（${name}）的 reviewAt 不是 YYYY-MM-DD`);
  if (!Array.isArray(e.sources) || e.sources.length === 0) throw new CompanyDirectoryError(`${where}（${name}）没有公开证据链接`);
  const sources = e.sources.map((s, i) => parseSource(s, `${where} 第 ${i} 条证据`));
  const aliases = Array.isArray(e.aliases) ? e.aliases.map(str).filter(Boolean) : [];
  return {
    name,
    domain,
    tier,
    identityConfirmed: e.identityConfirmed,
    aliases,
    identityBasis,
    tierBasis,
    reviewAt,
    sources,
    researchSources: Array.isArray(e.researchSources) ? e.researchSources.map(str).filter(url => /^https:\/\//.test(url)).slice(0, 2) : undefined,
  };
}

/** 归一只做大小写与空白/标点剥离，不做模糊匹配：同名法人必须分开登记。 */
function normalize(value: string): string {
  return value.toLowerCase().replace(/[\s./,()（）&-]+/g, "");
}

export function parseCompanyDirectory(input: unknown): CompanyDirectoryRecord[] {
  if (!input || typeof input !== "object") throw new CompanyDirectoryError("顶层不是对象");
  const entries = (input as { entries?: unknown }).entries;
  if (!Array.isArray(entries)) throw new CompanyDirectoryError("缺 entries 数组");
  const records = entries.map(parseEntry);
  const seen = new Map<string, CompanyDirectoryRecord>();
  for (const record of records) {
    for (const alias of [record.name, ...record.aliases]) {
      const key = `${normalize(alias)}|${normalize(record.domain)}`;
      const clash = seen.get(key);
      // 同一条记录里 name 与 alias 归一后撞上不算冲突；跨记录撞名才必须拆开登记
      if (clash && clash !== record) throw new CompanyDirectoryError(`「${alias}」在 ${clash.name} 与 ${record.name} 之间重复登记`);
      seen.set(key, record);
    }
  }
  return records;
}

export interface CompanyTierDirectoryWithRecords extends CompanyTierDirectory {
  /** 给用户标注用的完整记录（含依据与证据链接）。 */
  recordFor(name: string): CompanyDirectoryRecord | null;
  records: CompanyDirectoryRecord[];
  verifiedAt: string;
}

/** 建索引：同名跨法人一律作废纯名字键（见循环里的注释），域名给全时仍可精确命中。 */
export function indexCompanyDirectory(records: CompanyDirectoryRecord[], verifiedAt: string): CompanyTierDirectoryWithRecords {
  const index = new Map<string, CompanyDirectoryRecord>();
  const ambiguous = new Set<string>();
  for (const record of records) {
    for (const alias of [record.name, ...record.aliases]) {
      index.set(`${normalize(alias)}|${normalize(record.domain)}`, record);
      const plain = normalize(alias);
      const other = index.get(plain);
      // 绝不能把两个同名法人合成一条层次结论：查不到 = 拿不准 = 保留
      if (other && other !== record) {
        index.delete(plain);
        ambiguous.add(plain);
      } else if (!ambiguous.has(plain)) {
        index.set(plain, record);
      }
    }
  }
  return {
    records,
    verifiedAt,
    lookup: (name, domain) => {
      const key = domain ? `${normalize(name)}|${normalize(domain)}` : normalize(name);
      const hit = index.get(key);
      if (!hit) return null;
      return { name: hit.name, domain: hit.domain, tier: hit.tier, identityConfirmed: hit.identityConfirmed };
    },
    recordFor: (name) => index.get(normalize(name)) ?? null,
  };
}

/**
 * 装载名录。数据不合法会抛 `CompanyDirectoryError`——调用方（核验适配器）
 * 按 FR-9 的失败语义接住：不剔除任何岗位，全部保留并标注未核验。
 */
export function loadCompanyDirectory(): CompanyTierDirectoryWithRecords {
  const records = parseCompanyDirectory(rawDirectory);
  const verifiedAt = str((rawDirectory as { verifiedAt?: unknown }).verifiedAt);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(verifiedAt)) throw new CompanyDirectoryError("缺 verifiedAt 日期");
  return indexCompanyDirectory(records, verifiedAt);
}
