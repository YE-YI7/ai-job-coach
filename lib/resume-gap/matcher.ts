/**
 * 简历 ↔ JD 关键词/硬门槛 对照器 · 纯函数模块
 *
 * 设计口径（务必与页面文案保持一致）：
 * - 确定性词面命中对照：无模型、无网络、无副作用（模块内仅缓存预编译正则，结果确定）。
 * - 不做语义理解：中文分词无法在本模块内做，中文关键词依赖下方可配置词典 SKILL_DICTIONARY；
 *   英文/驼峰 token 与「数字+单位」token 用正则从 JD 里补充抽取。
 * - 命中判断前先做文本规范化：小写化、全角转半角、去所有空白；
 *   别名归一（js↔javascript、golang↔go、大厂名如 字节/今日头条↔字节跳动）通过词典别名组实现。
 * - 硬门槛（经验年限/学历/语言/地点/实习·到岗/院校）用正则+词典从 JD 原文抽取，
 *   satisfied 只表示「简历里找到了对应词面证据」，未找到记为未满足/存疑，附 jdEvidence 原文片段。
 * - 空输入 / 非字符串输入安全：一律按空串处理，不抛异常。
 * - 输入长度防御性截断（前端另有 ≤20000 字裁剪提示）。
 */

/* ============================
   类型
   ============================ */

export interface ResumeGapInput {
  resumeText: string;
  jdText: string;
}

/** JD 关键词对照条目：term 为归一后的展示词，inResume 表示简历里是否有词面命中 */
export interface GapTermHit {
  term: string;
  inResume: boolean;
}

export interface HardRequirement {
  label: string;
  satisfied: boolean;
  /** JD 原文命中片段（截断），供用户回查上下文 */
  jdEvidence: string;
}

export interface GapSummary {
  /** JD 里抽出的关键词总数（= matched.length） */
  jdKeywordCount: number;
  /** 其中简历命中的条数 */
  matchedCount: number;
  /** 未命中的条数（= missing.length） */
  missingCount: number;
  /** 硬门槛中未满足/存疑的条数 */
  hardUnmet: number;
}

export interface GapReport {
  matched: GapTermHit[];
  missing: string[];
  hardRequirements: HardRequirement[];
  /** 疑似「动词开头但零数字/百分比」的简历条目摘录（每条 ≤60 字） */
  weakQuantification: string[];
  summary: GapSummary;
}

/* 前端与 matcher 共同的防御上限 */
export const MAX_TEXT_LENGTH = 20000;

/* ============================
   可配置中文技能词典（别名组 = 归一）
   ============================ */

interface DictEntry {
  /** 归一展示词 */
  term: string;
  /** 别名（含英文小写形式）；ascii 别名走词边界匹配，中文别名走子串匹配 */
  aliases: string[];
}

const isAsciiToken = /^[a-z0-9+#./ _-]+$/;

export const SKILL_DICTIONARY: DictEntry[] = [
  // —— 编程语言 / 基础 ——
  { term: 'Java', aliases: ['java'] },
  { term: 'Python', aliases: ['python'] },
  { term: 'Go', aliases: ['go', 'golang'] },
  { term: 'C++', aliases: ['c++', 'cpp'] },
  { term: 'JavaScript', aliases: ['js', 'javascript', 'ecmascript'] },
  { term: 'TypeScript', aliases: ['ts', 'typescript'] },
  { term: 'SQL', aliases: ['sql'] },
  { term: 'Shell', aliases: ['shell', 'bash'] },
  { term: 'R语言', aliases: ['r语言'] },
  // —— 前端 / 客户端 ——
  { term: 'React', aliases: ['react', 'reactjs', 'react.js'] },
  { term: 'Vue', aliases: ['vue', 'vue.js', 'vue3'] },
  { term: '小程序', aliases: ['小程序', '微信小程序'] },
  { term: 'iOS', aliases: ['ios', 'swift'] },
  { term: 'Android', aliases: ['android', 'kotlin'] },
  // —— 服务端 / 数据 ——
  { term: 'Node.js', aliases: ['node', 'node.js', 'nodejs'] },
  { term: 'Spring Boot', aliases: ['spring', 'spring boot', 'springboot', 'spring-boot'] },
  { term: 'MySQL', aliases: ['mysql'] },
  { term: 'Redis', aliases: ['redis'] },
  { term: 'MongoDB', aliases: ['mongodb', 'mongo'] },
  { term: 'Kafka', aliases: ['kafka'] },
  { term: 'Docker', aliases: ['docker'] },
  { term: 'Kubernetes', aliases: ['kubernetes', 'k8s'] },
  { term: 'Linux', aliases: ['linux'] },
  { term: 'Git', aliases: ['git'] },
  { term: 'CI/CD', aliases: ['ci/cd', 'cicd'] },
  { term: '数据仓库', aliases: ['数据仓库', '数仓', 'dwh'] },
  { term: 'ETL', aliases: ['etl'] },
  { term: 'Hadoop', aliases: ['hadoop'] },
  { term: 'Spark', aliases: ['spark'] },
  { term: 'Flink', aliases: ['flink'] },
  // —— 计算机基础 ——
  { term: '数据结构', aliases: ['数据结构'] },
  { term: '算法', aliases: ['算法', 'leetcode', '力扣'] },
  { term: '操作系统', aliases: ['操作系统'] },
  { term: '计算机网络', aliases: ['计算机网络'] },
  { term: '分布式', aliases: ['分布式', '分布式系统'] },
  { term: '高并发', aliases: ['高并发', '并发'] },
  { term: '微服务', aliases: ['微服务'] },
  { term: '多线程', aliases: ['多线程'] },
  { term: '性能优化', aliases: ['性能优化'] },
  { term: '单元测试', aliases: ['单元测试', '单测'] },
  { term: '爬虫', aliases: ['爬虫'] },
  // —— AI / 数据算法 ——
  { term: '机器学习', aliases: ['机器学习', 'machine learning'] },
  { term: '深度学习', aliases: ['深度学习', 'deep learning'] },
  { term: '大模型', aliases: ['大模型', 'llm', 'llms'] },
  { term: 'RAG', aliases: ['rag'] },
  { term: 'NLP', aliases: ['nlp', '自然语言处理'] },
  { term: '推荐系统', aliases: ['推荐系统', '推荐算法'] },
  { term: '搜索推荐', aliases: ['搜索推荐'] },
  { term: 'PyTorch', aliases: ['pytorch', 'torch'] },
  { term: 'TensorFlow', aliases: ['tensorflow'] },
  { term: '数据分析', aliases: ['数据分析'] },
  { term: 'A/B测试', aliases: ['a/b测试', 'ab测试', 'abtest', 'a/b test'] },
  { term: '指标体系', aliases: ['指标体系'] },
  { term: '埋点', aliases: ['埋点'] },
  // —— 产品 / 运营 / 业务 ——
  { term: 'PRD', aliases: ['prd', '产品需求文档'] },
  { term: '需求分析', aliases: ['需求分析'] },
  { term: '用户调研', aliases: ['用户调研'] },
  { term: '竞品分析', aliases: ['竞品分析'] },
  { term: '原型', aliases: ['原型', '原型设计'] },
  { term: 'Figma', aliases: ['figma'] },
  { term: 'Axure', aliases: ['axure'] },
  { term: 'Sketch', aliases: ['sketch'] },
  { term: '项目管理', aliases: ['项目管理'] },
  { term: '敏捷开发', aliases: ['敏捷', 'scrum', 'agile'] },
  { term: '用户增长', aliases: ['用户增长', '增长'] },
  { term: '拉新', aliases: ['拉新'] },
  { term: '留存', aliases: ['留存'] },
  { term: '转化率', aliases: ['转化率'] },
  { term: '商业化', aliases: ['商业化'] },
  { term: 'GMV', aliases: ['gmv'] },
  { term: 'DAU', aliases: ['dau', '日活'] },
  { term: 'MAU', aliases: ['mau', '月活'] },
  { term: 'ROI', aliases: ['roi'] },
  { term: 'SaaS', aliases: ['saas'] },
  { term: 'B端', aliases: ['b端', 'to b', 'tob'] },
  { term: 'C端', aliases: ['c端', 'to c', 'toc'] },
  { term: '内容运营', aliases: ['内容运营'] },
  { term: '活动策划', aliases: ['活动策划'] },
  { term: '用户画像', aliases: ['用户画像'] },
  { term: 'Excel', aliases: ['excel'] },
  { term: 'PPT', aliases: ['ppt'] },
  // —— 软技能 ——
  { term: '沟通', aliases: ['沟通', '沟通能力'] },
  { term: '跨部门协作', aliases: ['跨部门', '协作'] },
  { term: '团队管理', aliases: ['团队管理', '带团队', '管理经验'] },
  { term: '抗压', aliases: ['抗压'] },
  { term: '自驱', aliases: ['自驱', '自驱力', '自我驱动', '主动性'] },
  { term: '逻辑思维', aliases: ['逻辑思维'] },
  // —— 大厂别名归一（词面）——
  { term: '字节跳动', aliases: ['字节', '字节跳动', '今日头条', 'bytedance'] },
  { term: '阿里巴巴', aliases: ['阿里', '阿里巴巴', 'alibaba', '蚂蚁'] },
  { term: '腾讯', aliases: ['腾讯', 'tencent'] },
];

/* 英文停用词：抽取 JD 英文 token 时过滤，避免噪声 */
const STOP_TOKENS = new Set([
  'the', 'and', 'for', 'you', 'your', 'our', 'will', 'with', 'this', 'that', 'from',
  'have', 'has', 'are', 'can', 'who', 'what', 'when', 'where', 'why', 'how', 'all',
  'any', 'team', 'teams', 'work', 'working', 'job', 'role', 'year', 'years', 'plus',
  'good', 'great', 'strong', 'able', 'ability', 'also', 'than', 'then', 'them', 'they',
  'their', 'out', 'get', 'got', 'etc', 'per', 'not', 'but', 'are', 'com', 'www', 'cn',
  'preferred', 'experience', 'responsibilities', 'requirements', 'minimum', 'required',
]);

/* 短白名单：长度 <3 也允许抽为 token 的技术缩写 */
const SHORT_TOKEN_WHITELIST = new Set(['ai', 'ml', 'go', 'js', 'ts', 'ui', 'ux', 'qa', 'pm', 'hr', 'bg']);

/* ============================
   规范化与命中判断
   ============================ */

function asText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** 小写化、全角转半角、去掉所有空白（含全角空格）；保留 . / + - 等术语内标点 */
export function normalizeText(raw: unknown): string {
  let s = asText(raw).slice(0, MAX_TEXT_LENGTH * 2);
  s = s.replace(/[\uFF01-\uFF5E\u3000]/g, (ch) =>
    ch === '\u3000' ? ' ' : String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
  );
  s = s.toLowerCase();
  s = s.replace(/\s+/g, '');
  return s;
}

const boundaryCache = new Map<string, RegExp>();
function asciiBoundaryRe(alias: string): RegExp {
  let re = boundaryCache.get(alias);
  if (!re) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    re = new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`);
    boundaryCache.set(alias, re);
  }
  return re;
}

/** 归一化文本 norm 里是否含有 alias（英文走词边界，中文走子串） */
function containsAlias(norm: string, alias: string): boolean {
  if (isAsciiToken.test(alias)) return asciiBoundaryRe(alias).test(norm);
  return norm.includes(alias);
}

/** 词典命中检测：返回命中的条目（用于 JD 抽取或简历命中判断） */
function dictHits(norm: string): DictEntry[] {
  return SKILL_DICTIONARY.filter((entry) =>
    [entry.term.toLowerCase(), ...entry.aliases].some((a) => containsAlias(norm, a)),
  );
}

/* ============================
   JD 关键词抽取
   ============================ */

interface Candidate {
  display: string;
  check: (resumeNorm: string) => boolean;
  rank: number; // 词典 > 英文 token > 数字单位
}

function extractJdCandidates(jdText: string): Candidate[] {
  const norm = normalizeText(jdText);
  if (!norm) return [];
  const byKey = new Map<string, Candidate>();

  // 1) 词典命中（含中文技能词与别名归一）
  const coveredAliases = new Set<string>();
  for (const entry of dictHits(norm)) {
    const keys = [entry.term.toLowerCase(), ...entry.aliases];
    keys.forEach((a) => coveredAliases.add(a.replace(/\s+/g, '')));
    const key = entry.term.toLowerCase();
    if (!byKey.has(key)) {
      byKey.set(key, {
        display: entry.term,
        check: (r) => keys.some((a) => containsAlias(r, a.replace(/\s+/g, ''))),
        rank: 0,
      });
    }
  }

  // 2) 英文/驼峰 token（在归一文本上按字母起头切段）
  const tokenRe = /[a-z][a-z0-9+#._-]{1,24}/g;
  for (const m of norm.matchAll(tokenRe)) {
    let tok = m[0].replace(/[._+-]+$/, ''); // 去掉句读粘连
    if (tok.length >= 2 && tok.endsWith('.') ) tok = tok.slice(0, -1);
    if (tok.length < 2) continue;
    if (tok.length < 3 && !SHORT_TOKEN_WHITELIST.has(tok)) continue;
    if (STOP_TOKENS.has(tok)) continue;
    // 与任一较长词典别名互相包含 → 已归一为词典词，跳过
    let covered = false;
    for (const a of coveredAliases) {
      if (a.length >= 4 && (tok.includes(a) || a.includes(tok))) { covered = true; break; }
      if (a === tok) { covered = true; break; }
    }
    if (covered || byKey.has(tok)) continue;
    byKey.set(tok, { display: tok, check: (r) => containsAlias(r, tok), rank: 1 });
  }

  // 3) 数字+单位 token（10w、20%、百万级…）
  const numRe = /[0-9]+(?:\.[0-9]+)?(?:%|k\+|k|w\+|w|万|亿)|[千百十万亿]+级/g;
  for (const m of norm.matchAll(numRe)) {
    const tok = m[0];
    if (byKey.has(tok)) continue;
    byKey.set(tok, { display: tok, check: (r) => r.includes(tok), rank: 2 });
  }

  return [...byKey.values()];
}

/* ============================
   硬门槛抽取（正则 + 词典，附 JD 原文证据）
   ============================ */

const CN_NUM: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

function numFrom(token: string): number {
  const n = Number(token);
  if (Number.isFinite(n)) return n;
  if (token in CN_NUM) return CN_NUM[token];
  if (/^十[一二三四五六七八九]?$/.test(token)) return 10 + (CN_NUM[token[1]] ?? 0);
  return NaN;
}

/** 从原文 raw 中 index 处、长 len 的命中，扩成一句证据（≤80 字，压掉换行） */
function evidenceWindow(raw: string, index: number, len: number): string {
  const stops = /[。；;\n！!？?]/;
  let start = index;
  let guard = 0;
  while (start > 0 && !stops.test(raw[start - 1]) && index - start < 36 && guard++ < 200) start--;
  let end = Math.min(raw.length, index + len);
  guard = 0;
  while (end < raw.length && !stops.test(raw[end]) && end - (index + len) < 44 && guard++ < 200) end++;
  return raw.slice(start, end).replace(/\s+/g, ' ').trim().slice(0, 80);
}

function extractHardRequirements(jdText: string, resumeText: string): HardRequirement[] {
  const jd = asText(jdText);
  const jdNorm = normalizeText(jd);
  const resume = asText(resumeText);
  const resumeNorm = normalizeText(resume);
  const out: HardRequirement[] = [];
  if (!jdNorm) return out;

  // —— 1. 经验年限 ——
  // 前缀 (?:^|[^\d]) 防止从「2024年」这类日期里回溯截出个位数假门槛
  const expRe =
    /(?:^|[^\d])(\d+(?:\.\d+)?|[一二两三四五六七八九十])\s*[-~至]\s*(\d+(?:\.\d+)?|[一二两三四五六七八九十])\s*年|(?:^|[^\d])(\d+(?:\.\d+)?|[一二两三四五六七八九十])\s*(?:\+|以上)?\s*年\s*(?:及)?(?:\+|以上)?\s*(?:的)?\s*(?:相关\s*)?(?:工作|实习|开发|从业|行业|经验)|(?:经验|experience)\D{0,6}?(\d+(?:\.\d+)?|[一二两三四五六七八九十])\s*年|(?:^|[^\d])(\d+)\s*\+?\s*years?/gi;
  let needYears = 0;
  let expEvidence = '';
  for (const m of jd.matchAll(expRe)) {
    const idx = m.index ?? 0;
    const nums = [m[1], m[2], m[3], m[4], m[5], m[6]]
      .map((t) => (t ? numFrom(t) : NaN))
      .filter((n) => Number.isFinite(n) && n > 0 && n <= 30);
    if (!nums.length) continue;
    const hi = Math.max(...nums);
    if (hi > needYears) {
      needYears = hi;
      expEvidence = evidenceWindow(jd, idx, m[0].length);
    }
  }
  if (needYears > 0) {
    let resumeYears = 0;
    const reResume =
      /(?:^|[^\d])(\d+(?:\.\d+)?|[一二两三四五六七八九十]{1,3})\s*(?:\+|以上)?\s*年\s*(?:及)?(?:\+|以上)?\s*(?:的)?\s*(?:相关\s*)?(?:工作经验|开发经验|实习经验|项目经验|从业经验|经验|工作|开发|从业)/gi;
    for (const m of resume.matchAll(reResume)) {
      const n = numFrom(m[1]);
      if (Number.isFinite(n) && n > 0 && n <= 40) resumeYears = Math.max(resumeYears, n);
    }
    out.push({
      label: `工作经验：≥ ${needYears} 年`,
      satisfied: resumeYears >= needYears,
      jdEvidence: expEvidence,
    });
  }

  // —— 2. 学历 ——
  const EDU_RANK: Array<[string, number]> = [
    ['大专', 1], ['专科', 1], ['本科', 2], ['学士', 2], ['硕士', 3], ['研究生', 3], ['博士', 4],
  ];
  let eduReqWord = '';
  let eduReqRank = Infinity;
  let eduEvidence = '';
  for (const [word, rank] of EDU_RANK) {
    const idx = jd.indexOf(word);
    if (idx >= 0 && rank <= eduReqRank) {
      // 取最低门槛（如「本科及以上，硕士优先」→ 门槛是本科）
      if (rank < eduReqRank || !eduReqWord) {
        eduReqRank = rank;
        eduReqWord = word;
        eduEvidence = evidenceWindow(jd, idx, word.length);
      }
    }
  }
  if (eduReqWord) {
    let resumeRank = 0;
    for (const [word, rank] of EDU_RANK) {
      if (normalizeText(word) && resumeNorm.includes(word)) resumeRank = Math.max(resumeRank, rank);
    }
    // 「XX大学/学院」等无关键词时判不出来 → 未满足（存疑），提示人工确认
    out.push({
      label: `学历：${eduReqWord}及以上`,
      satisfied: resumeRank >= eduReqRank,
      jdEvidence: eduEvidence,
    });
  }

  // —— 3. 语言能力 ——
  const LANGS: Array<[string, string[]]> = [
    ['英语', ['英语', 'english', 'cet-4', 'cet-6', 'cet4', 'cet6', '四级', '六级', '雅思', '托福', 'ielts', 'toefl', '专四', '专八']],
    ['日语', ['日语', 'japanese', 'n1', 'n2', '能力考']],
    ['韩语', ['韩语', 'korean', 'topik']],
    ['德语', ['德语', 'german']],
    ['法语', ['法语', 'french']],
  ];
  for (const [name, resumeHints] of LANGS) {
    const idx = jd.indexOf(name);
    if (idx < 0) continue;
    out.push({
      label: `语言能力：${name}`,
      satisfied: resumeHints.some((h) => containsAlias(resumeNorm, h.toLowerCase())),
      jdEvidence: evidenceWindow(jd, idx, name.length),
    });
  }

  // —— 4. 工作地点 ——
  const CITIES = ['北京', '上海', '广州', '深圳', '杭州', '成都', '武汉', '南京', '西安', '苏州', '天津', '重庆', '远程'];
  const jdCities: string[] = [];
  let cityEvidence = '';
  for (const city of CITIES) {
    const idx = jd.indexOf(city);
    if (idx >= 0) {
      jdCities.push(city);
      if (!cityEvidence) cityEvidence = evidenceWindow(jd, idx, city.length);
    }
  }
  if (jdCities.length > 0) {
    out.push({
      label: `工作地点：${jdCities.join(' / ')}`,
      satisfied: jdCities.some((c) => resumeNorm.includes(c)) || jdCities.includes('远程'),
      jdEvidence: cityEvidence,
    });
  }

  // —— 5. 实习时长 / 到岗要求 ——
  const internWeek = /每周\s*(?:实习\s*)?([0-9])\s*天/.exec(jd);
  const internMonth = /(?:持续|实习)\s*([0-9]+)\s*个?\s*月(?:以上)?|(?:([0-9]+)\s*个?\s*月(?:以上|起))\s*(?:的)?\s*实习/.exec(jd);
  const arrival = /(随时到岗|尽快到岗|即时到岗|[一两二三四五六七八九十0-9]+\s*(?:周|天|个月)\s*以内?\s*(?:内)?到岗|[一两二三四五六七八九十0-9]+\s*(?:周|天|个月)\s*(?:后|内)可到岗)/.exec(jd);
  if (internWeek || internMonth || arrival) {
    const evidence = (internWeek ?? internMonth ?? arrival) as RegExpExecArray | null;
    const hasDays = /\d+\s*(?:天|日)\s*\/\s*周|每周\s*\d+\s*天|\d\s*天\s*\/\s*周/.test(resume);
    const hasMonths = /\d+\s*个?\s*月/.test(resumeNorm);
    const hasArrival = /到岗|待离职|随时/.test(resume);
    const satisfied = Boolean((internWeek && hasDays) || (internMonth && hasMonths) || (arrival && hasArrival));
    const parts: string[] = [];
    if (internWeek) parts.push(`每周 ${internWeek[1]} 天`);
    if (internMonth) parts.push(`持续 ${internMonth[1] ?? internMonth[2]} 个月以上`);
    if (arrival) parts.push(arrival[1]);
    out.push({
      label: `实习/到岗：${parts.join('，')}`,
      satisfied,
      jdEvidence: evidence ? evidenceWindow(jd, evidence.index, evidence[0].length) : '',
    });
  }

  // —— 6. 院校/身份硬线 ——
  for (const word of ['985', '211', '统招', '全日制', '海归', '留学生']) {
    const idx = jd.indexOf(word);
    if (idx >= 0) {
      out.push({
        label: `院校要求：${word}`,
        satisfied: containsAlias(resumeNorm, word),
        jdEvidence: evidenceWindow(jd, idx, word.length),
      });
      break; // 归并成一条，避免噪声
    }
  }

  return out;
}

/* ============================
   疑似缺量化证据的简历条目
   ============================ */

const ACTION_VERBS = [
  '负责', '参与', '协助', '支持', '跟进', '推动', '完成', '优化', '维护', '搭建',
  '开发', '设计', '实现', '分析', '调研', '编写', '处理', '对接', '组织', '策划', '测试', '部署',
];
const QUANT_EVIDENCE = /\d|[%％]|万|亿|[一二两三四五六七八九十]+倍|从0|首次|之一|top/i;
const BULLET_HEAD = /^\s*(?:[•·*\-—●○>]+|[0-9]{1,2}[.、)]|[（(][一二三四五六七八九十]{1,3}[)）])\s*/;

function extractWeakQuantification(resumeText: string): string[] {
  const raw = asText(resumeText);
  if (!raw.trim()) return [];
  const lines = raw.split(/[\n；;]+/);
  const hits: string[] = [];
  const seen = new Set<string>();
  for (const line0 of lines) {
    const line = line0.replace(BULLET_HEAD, '').trim();
    if (line.length < 8) continue;
    if (!ACTION_VERBS.some((v) => line.startsWith(v))) continue;
    if (QUANT_EVIDENCE.test(line)) continue;
    const snippet = line.slice(0, 60);
    if (seen.has(snippet)) continue;
    seen.add(snippet);
    hits.push(snippet);
    if (hits.length >= 12) break;
  }
  return hits;
}

/* ============================
   主入口
   ============================ */

export function analyzeResumeGap(input: ResumeGapInput): GapReport {
  const resumeNorm = normalizeText(input && input.resumeText);
  const candidates = extractJdCandidates(input && input.jdText);

  const matched: GapTermHit[] = candidates
    .map((c) => ({ term: c.display, inResume: c.check(resumeNorm) }))
    .sort(
      (a, b) =>
        Number(b.inResume) - Number(a.inResume) || a.term.localeCompare(b.term, 'zh-Hans-CN'),
    );
  const missing = matched.filter((m) => !m.inResume).map((m) => m.term);
  const hardRequirements = extractHardRequirements(input && input.jdText, input && input.resumeText);
  const weakQuantification = extractWeakQuantification(input && input.resumeText);

  const summary: GapSummary = {
    jdKeywordCount: matched.length,
    matchedCount: matched.length - missing.length,
    missingCount: missing.length,
    hardUnmet: hardRequirements.filter((h) => !h.satisfied).length,
  };

  return { matched, missing, hardRequirements, weakQuantification, summary };
}
