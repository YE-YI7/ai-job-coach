/** Formatting equivalence only. Units, date precision and numeric values remain distinct. */
export function resumeNumberTokens(text: string): Set<string> {
  const tokens = new Set<string>();
  const body = text.replace(/^\s*(?:[-*•]\s+)?\d{1,2}[.)、]\s+/gm, "")
    .replace(/(?<!\d)(\d{4})\s*(?:年\s*|[./-])(\d{1,2})(?:(?:\s*月(?:份)?)(?:\s*(\d{1,2})\s*日)?|[./-](\d{1,2}))?(?!\d)/g,
      (raw, year: string, month: string, chineseDay?: string, separatedDay?: string) => {
        const day=chineseDay||separatedDay;
        if (+month < 1 || +month > 12 || day && (+day < 1 || +day > 31)) return raw;
        tokens.add(`date:${year}-${month.padStart(2, "0")}${day ? "-" + day.padStart(2, "0") : ""}`);
        return " ";
      });
  for (const match of body.matchAll(/(?<![A-Za-z\d])[¥￥$]?\d+(?:[.,]\d+)?(?:\s*(?:PP|pp|%|万|亿|[kK]|人|次|个月|年|天|分钟|元))?(?![A-Za-z\d])/g))
    tokens.add(match[0].replace(/\s/g, "").replace(/pp$/, "PP"));
  return tokens;
}
