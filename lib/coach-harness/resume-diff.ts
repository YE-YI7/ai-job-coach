// Diff helpers shared by the resume-draft route: detect "same-meaning reword"
// suggestions (拆成→拆解为) that carry no information gain and should not be
// surfaced for confirmation. Lives outside route.ts because Next only allows
// HTTP handlers (+config) to be exported from a route module.

function normalizeForDiff(value: string) {
  return value.toLowerCase().replace(/[\s，。、；：！？“”‘’（）()《》\-—·|/\\]+/g, "");
}

function editDistanceWithin(a: string, b: string, limit: number) {
  if (Math.abs(a.length - b.length) > limit) return Number.POSITIVE_INFINITY;
  const prev: number[] = [];
  const cur: number[] = [];
  for (let i = 0; i <= a.length; i += 1) prev[i] = i;
  for (let j = 1; j <= b.length; j += 1) {
    cur[0] = j;
    let rowMin = cur[0];
    for (let i = 1; i <= a.length; i += 1) {
      cur[i] = Math.min(prev[i] + 1, cur[i - 1] + 1, prev[i - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[i] < rowMin) rowMin = cur[i];
    }
    if (rowMin > limit) return Number.POSITIVE_INFINITY;
    for (let i = 0; i <= a.length; i += 1) prev[i] = cur[i];
  }
  return prev[a.length];
}

/** 忽略空白与标点后编辑距离 ≤10%（下限 2）视为同义换词：没有信息增量，不该让用户确认。 */
export function isTrivialRewrite(before: string, after: string) {
  const a = normalizeForDiff(before);
  const b = normalizeForDiff(after);
  if (!a || !b) return true;
  if (a === b) return true;
  const limit = Math.max(2, Math.floor(Math.min(a.length, b.length) * 0.1));
  return editDistanceWithin(a, b, limit) <= limit;
}
