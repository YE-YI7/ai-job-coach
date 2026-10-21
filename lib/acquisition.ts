/** Coarse, controlled attribution only. Never persist/send a URL, query or referrer. */
export const ACQUISITION_LABELS = {
  direct: "直接访问 / 来源未传递", google: "Google", bing: "Bing", baidu: "百度",
  sogou: "搜狗", so: "360 搜索", sm: "神马", duckduckgo: "DuckDuckGo",
  chatgpt: "ChatGPT", perplexity: "Perplexity", doubao: "豆包", kimi: "Kimi",
  deepseek: "DeepSeek", yuanbao: "腾讯元宝", copilot: "Copilot", gemini: "Gemini", qwen: "千问",
  watcha: "观猹", xiaohongshu: "小红书", wechat: "微信", github: "GitHub",
  campaign_other: "其他链接标签", external: "其他外站", "growth-qa": "隔离验收",
} as const;
export type AcquisitionSource = keyof typeof ACQUISITION_LABELS;
export const ACQUISITION_VERSION = 2;
export const ACQUISITION_SESSION_MS = 30 * 60 * 1000;
export const FIRST_SOURCE_KEY = "yi-zhi-acquisition-first-v2";
export const SESSION_SOURCE_KEY = "yi-zhi-acquisition-session-v2";
const LEGACY_SOURCE_KEY = "yi-zhi-first-touch-source-v1";
const HOSTS: [AcquisitionSource, string[]][] = [
  ["chatgpt", ["chatgpt.com", "chat.openai.com"]], ["perplexity", ["perplexity.ai"]],
  ["doubao", ["doubao.com"]], ["kimi", ["kimi.com", "kimi.moonshot.cn"]],
  ["deepseek", ["deepseek.com"]], ["yuanbao", ["yuanbao.tencent.com"]],
  ["copilot", ["copilot.microsoft.com"]], ["gemini", ["gemini.google.com"]],
  ["qwen", ["qianwen.com", "chat.qwen.ai", "tongyi.aliyun.com"]],
  ["google", ["google.com", "google.com.hk", "google.com.tw", "google.co.jp", "google.co.uk", "google.de"]],
  ["bing", ["bing.com"]], ["baidu", ["baidu.com"]], ["sogou", ["sogou.com"]],
  ["so", ["so.com"]], ["sm", ["sm.cn"]], ["duckduckgo", ["duckduckgo.com"]],
  ["watcha", ["watcha.cn"]], ["xiaohongshu", ["xiaohongshu.com", "xhslink.com"]],
  ["wechat", ["weixin.qq.com"]], ["github", ["github.com"]],
];
export function isAcquisitionSource(value: unknown): value is AcquisitionSource {
  return typeof value === "string" && Object.hasOwn(ACQUISITION_LABELS, value);
}
export function acquisitionLabel(source: string) {
  return isAcquisitionSource(source) ? ACQUISITION_LABELS[source] : "未记录";
}
function sameHost(host: string, base: string) { return host === base || host.endsWith(`.${base}`); }
const SITE_HOSTS = ["yizhioffer.com", "ai-job-coach.xin", "aijobcoach.xin"];
/** Explicit campaign labels take precedence; unknown values collapse before storage. */
export function classifyAcquisition(search: string, referrer: string, currentHost: string): AcquisitionSource | null {
  const params = new URLSearchParams(search);
  const tagged = (params.get("utm_source") || params.get("ref") || "").trim().toLowerCase();
  if (tagged) {
    if (/^growth-qa(?:-|$)/.test(tagged)) return "growth-qa";
    const aliases: Record<string, AcquisitionSource> = { guancha: "watcha", xhs: "xiaohongshu", wx: "wechat", openai: "chatgpt", chatgpt: "chatgpt" };
    if (Object.hasOwn(aliases, tagged)) return aliases[tagged];
    return isAcquisitionSource(tagged) ? tagged : "campaign_other";
  }
  if (!referrer) return null;
  try {
    const url = new URL(referrer);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    const host = url.hostname.toLowerCase();
    if (host === currentHost.toLowerCase() || SITE_HOSTS.some((base) => sameHost(host, base))) return null;
    return HOSTS.find(([, domains]) => domains.some((base) => sameHost(host, base)))?.[0] || "external";
  } catch { return null; }
}

export interface Attribution {
  source: AcquisitionSource;
  first_source: AcquisitionSource;
  session_source: AcquisitionSource;
  attribution_version: 2;
}
interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void }
export function createAcquisitionCollector() {
  let first: AcquisitionSource | null = null;
  let session: { source: AcquisitionSource; last: number } | null = null;
  let entryRead = false;
  function get(storage: StorageLike | undefined, key: string) { try { return storage?.getItem(key); } catch { return null; } }
  function set(storage: StorageLike | undefined, key: string, value: string) { try { storage?.setItem(key, value); } catch { /* Measurement cannot block a product action. */ } }
  return (input: { search: string; referrer: string; host: string; now: number; local?: StorageLike; tab?: StorageLike }): Attribution => {
    const legacyQa = /^growth-qa(?:-|$)/.test(get(input.local, LEGACY_SOURCE_KEY) || "");
    if (!first) {
      const stored = get(input.local, FIRST_SOURCE_KEY);
      if (isAcquisitionSource(stored)) first = stored;
    }
    if (!session) {
      try {
        const stored = JSON.parse(get(input.tab, SESSION_SOURCE_KEY) || "null");
        if (stored && isAcquisitionSource(stored.source) && Number.isFinite(stored.last) && stored.last <= input.now) session = stored;
      } catch { /* Invalid local state is ignored. */ }
    }
    // document.referrer and the landing query are entry signals, not new SPA referrals.
    const entry = !entryRead ? classifyAcquisition(input.search, input.referrer, input.host) : null;
    entryRead = true;
    if (legacyQa || entry === "growth-qa") session = { source: "growth-qa", last: input.now };
    else if (entry) session = { source: entry, last: input.now };
    else if (!session || input.now - session.last >= ACQUISITION_SESSION_MS) session = { source: "direct", last: input.now };
    session.last = input.now;
    if (!first) { first = session.source; set(input.local, FIRST_SOURCE_KEY, first); }
    set(input.tab, SESSION_SOURCE_KEY, JSON.stringify(session));
    return { source: first, first_source: first, session_source: session.source, attribution_version: 2 };
  };
}

const collect = createAcquisitionCollector();
export function captureAcquisition(): Attribution {
  let local: StorageLike | undefined, tab: StorageLike | undefined;
  try { local = window.localStorage; tab = window.sessionStorage; } catch { /* In-memory fallback. */ }
  return collect({ search: window.location.search, referrer: document.referrer, host: window.location.hostname, now: Date.now(), local, tab });
}

/** Client attribution is observational, not an authenticated claim about a referrer. */
export function sanitizeAcquisitionProperties<T extends Record<string, string | number | boolean | null>>(properties: T) {
  const clean: Record<string, string | number | boolean | null> = { ...properties };
  const validV2 = properties.attribution_version === 2 && isAcquisitionSource(properties.first_source) && isAcquisitionSource(properties.session_source);
  for (const key of ["source", "first_source", "session_source"]) {
    if (!(key in clean)) continue;
    clean[key] = isAcquisitionSource(clean[key]) ? clean[key] : /^growth-qa(?:-|$)/.test(String(clean[key])) ? "growth-qa" : "campaign_other";
  }
  if (!validV2) {
    delete clean.attribution_version; delete clean.first_source; delete clean.session_source;
  }
  return clean;
}
