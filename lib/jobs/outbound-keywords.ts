/**
 * 出网关键词的唯一口径（FR-8 的前置闸）。
 *
 * 取向：**结构上不外发自由文本**，而不是「先发再想办法擦」。
 * 1. 能出网的只有三类：求职方向（用户自己打的那句）、词表里的英文岗位名、词表里的技能词。
 * 2. 简历正文**永不整段出网**，也不从正文里抠片段拼查询——简历里有姓名、学校、前雇主、
 *    电话邮箱，抽取本身就是暴露面。
 * 3. 每个候选词再走 `stripPii` + `containsPii` 机械二道闸：方向那句里如果写着姓名或电话，
 *    照样剥掉/丢掉。
 * 4. 条数封顶（`MAX_KEYWORDS`），扇出预算由调用方控制。
 */
import { containsPii, MAX_KEYWORDS, stripPii, type PiiBits } from "@/lib/coach-harness/subagents/retrieval";
import { ROLE_SYNONYMS, SKILL_TERMS } from "./discovery";

export interface OutboundKeywordInput {
  role: string;
  resumeText: string;
  /** 已知属于这个用户的姓名/雇主（有则剥；没有也不靠它兜底，见第 2 条纪律）。 */
  pii?: PiiBits;
  limit?: number;
}

export interface OutboundKeywords {
  keywords: string[];
  /** 被闸挡掉的词：界面与评测要能回答「为什么搜得比你想的窄」。 */
  blocked: string[];
}

const EMPTY_PII: PiiBits = { names: [], companies: [] };

function candidateTerms(input: OutboundKeywordInput): string[] {
  const role = input.role.toLowerCase();
  const translated = ROLE_SYNONYMS.filter((group) => group.some((term) => role.includes(term))).flat();
  // 词表没覆盖的方向：把用户自己打的那句按空格/分隔拆开原样带上（仍要过闸）。
  const rawRoleParts = translated.length ? [] : role.split(/[\s/、,，+＋]+/).filter((part) => part.length >= 2);
  const resume = input.resumeText.toLowerCase();
  const skills = SKILL_TERMS.filter((term) => resume.split(/[。；;\n]/).some(clause=>clause.includes(term)&&!/(没有|没做|未做|不熟|不会|希望|想学|no experience|never)/i.test(clause)));
  return [...new Set([input.role.trim(), ...translated, ...rawRoleParts, ...skills].map((term) => stripPii(term, input.pii ?? EMPTY_PII)).filter(Boolean))];
}

export function outboundKeywords(input: OutboundKeywordInput): OutboundKeywords {
  const pii = input.pii ?? EMPTY_PII;
  const blocked: string[] = [];
  const keywords: string[] = [];
  for (const term of candidateTerms(input)) {
    if (term.length > 60) { blocked.push(term); continue; }
    if (containsPii(term, pii)) { blocked.push(term); continue; }
    // 剥完只剩符号/数字（姓名电话被擦掉的形状）不算关键词
    if (!/[\p{Letter}]{2}/u.test(term)) { blocked.push(term); continue; }
    keywords.push(term);
    if (keywords.length >= (input.limit ?? MAX_KEYWORDS)) break;
  }
  return { keywords, blocked };
}

/** 国内官网优先用中文岗位别名。仅重排/选择已经过隐私闸的词，不引入简历片段。 */
export function domesticKeywords(keywords: string[]): string[] {
  const chinese=keywords.filter(term=>/\p{Script=Han}/u.test(term));
  // Keep grounded technical terms too: Chinese role aliases must not erase Agent/RAG queries.
  return [...new Set([...chinese,...keywords.filter(term=>SKILL_TERMS.includes(term.toLowerCase()))])].slice(0,4);
}
