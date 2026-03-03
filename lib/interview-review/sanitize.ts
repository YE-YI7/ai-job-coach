/**
 * 面试复盘 - 自动脱敏工具
 * 在发送到 LLM 前，自动屏蔽敏感信息
 */

interface SanitizeResult {
  text: string;
  maskedCount: number;
  maskedTypes: string[];
}

// 中国手机号：1开头的11位数字
const PHONE_REGEX = /(?<!\d)(1[3-9]\d{9})(?!\d)/g;

// 邮箱
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// URL（http/https链接）
const URL_REGEX = /https?:\/\/[^\s,，。、）)}\]]+/g;

// 身份证号（18位）
const ID_CARD_REGEX = /(?<!\d)\d{6}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx](?!\d)/g;

// 银行卡号（16-19位纯数字，带可选空格分隔）
const BANK_CARD_REGEX = /(?<!\d)\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}(?:[\s-]?\d{1,3})?(?!\d)/g;

// IP 地址
const IP_REGEX = /(?<!\d)(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)(?!\d)/g;

// 内部项目代号：常见命名模式（全大写字母+数字的项目名，3-20字符）
// 用启发式规则：纯大写字母组合（≥3字）后面跟数字，或全大写+下划线的标识符
const PROJECT_CODE_REGEX = /\b[A-Z][A-Z0-9_]{2,19}\b/g;

// 常见中文姓名（2-4个汉字，前面有"我叫"、"面试官"、"同事"等提示词时才匹配）
const CHINESE_NAME_CONTEXT_REGEX = /(?:我(?:叫|是|的名字(?:叫|是))|面试官|同事|leader|Leader|经理|总监|主管|HR|hr)\s*[：:]?\s*([\u4e00-\u9fa5]{2,4})/g;

/**
 * 对文本进行自动脱敏
 */
export function sanitizeText(text: string): SanitizeResult {
  let result = text;
  let maskedCount = 0;
  const maskedTypes = new Set<string>();

  // 手机号 → 保留前3后4
  result = result.replace(PHONE_REGEX, (match) => {
    maskedCount++;
    maskedTypes.add("手机号");
    return match.slice(0, 3) + "****" + match.slice(7);
  });

  // 邮箱 → 保留首字母和域名
  result = result.replace(EMAIL_REGEX, (match) => {
    maskedCount++;
    maskedTypes.add("邮箱");
    const [local, domain] = match.split("@");
    return local[0] + "***@" + domain;
  });

  // URL → 替换为 [链接已隐藏]
  result = result.replace(URL_REGEX, () => {
    maskedCount++;
    maskedTypes.add("链接");
    return "[链接已隐藏]";
  });

  // 身份证号 → 保留前6后4
  result = result.replace(ID_CARD_REGEX, (match) => {
    maskedCount++;
    maskedTypes.add("身份证号");
    return match.slice(0, 6) + "********" + match.slice(14);
  });

  // IP 地址 → [IP已隐藏]
  result = result.replace(IP_REGEX, () => {
    maskedCount++;
    maskedTypes.add("IP地址");
    return "[IP已隐藏]";
  });

  // 中文姓名（有上下文提示的）→ 保留姓
  result = result.replace(CHINESE_NAME_CONTEXT_REGEX, (match, name: string) => {
    maskedCount++;
    maskedTypes.add("姓名");
    const masked = name[0] + "**";
    return match.replace(name, masked);
  });

  return {
    text: result,
    maskedCount,
    maskedTypes: Array.from(maskedTypes),
  };
}

/**
 * 检查文本是否包含可能的敏感信息（不做替换，仅检测）
 */
export function detectSensitiveInfo(text: string): {
  hasSensitive: boolean;
  types: string[];
} {
  const types: string[] = [];

  if (PHONE_REGEX.test(text)) types.push("手机号");
  PHONE_REGEX.lastIndex = 0;

  if (EMAIL_REGEX.test(text)) types.push("邮箱");
  EMAIL_REGEX.lastIndex = 0;

  if (URL_REGEX.test(text)) types.push("链接");
  URL_REGEX.lastIndex = 0;

  if (ID_CARD_REGEX.test(text)) types.push("身份证号");
  ID_CARD_REGEX.lastIndex = 0;

  if (IP_REGEX.test(text)) types.push("IP地址");
  IP_REGEX.lastIndex = 0;

  return {
    hasSensitive: types.length > 0,
    types,
  };
}
