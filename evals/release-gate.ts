/** 发布判定只消费明确的观测，不把「没测到」当成零缺陷。 */
export interface ReplayObservation {
  id: string;
  error?: unknown;
  rawReply?: string;
  visibleReply?: string;
  machineVerdict?: string;
}

export function replayGate(rows: ReplayObservation[], expectedCount: number) {
  const failures: string[] = [];
  if (!Number.isSafeInteger(expectedCount) || expectedCount < 1 || rows.length !== expectedCount) failures.push("样本数量不足或无效");
  if (new Set(rows.map(row => row.id)).size !== rows.length) failures.push("样本 ID 重复");
  for (const row of rows) {
    if (row.error) failures.push(`${row.id}: 调用失败`);
    else if (!row.rawReply?.trim() || !row.visibleReply?.trim()) failures.push(`${row.id}: 空输出`);
    else if (row.machineVerdict !== "无自动命中") failures.push(`${row.id}: ${row.machineVerdict || "缺少裁决"}`);
  }
  return { automaticChecksPassed: failures.length === 0, failures,
    semanticAcceptance: "not_evaluated" as const,
    note: "自动规则无命中不等于内容正确；仍需异模型评审及真人标注校准。" };
}

export interface ExperienceObservation {
  firstVisibleTextMs: number | null;
  interrupted: boolean | null;
  outputCharacters: number;
  /** null = 没观察到选择机会，不可当成未采纳。 */
  adopted: boolean | null;
}

export function experienceMetrics(rows: ExperienceObservation[]) {
  const percentile = (numbers: number[], p: number) => {
    if (!numbers.length) return null;
    const sorted = [...numbers].sort((a, b) => a - b);
    return sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)];
  };
  const visible = rows.map(row => row.firstVisibleTextMs).filter((n): n is number => n !== null && Number.isFinite(n) && n >= 0);
  const lengths = rows.map(row => row.outputCharacters).filter(n => Number.isFinite(n) && n >= 0);
  const decisions = rows.filter(row => row.adopted !== null);
  const interruptions = rows.filter(row => row.interrupted !== null);
  return { turns: rows.length, visibleTimingSamples: visible.length,
    p90FirstVisibleTextMs: percentile(visible, .9),
    interruptionSamples: interruptions.length,
    interruptionRate: interruptions.length ? interruptions.filter(row => row.interrupted).length / interruptions.length : null,
    outputLength: { p50: percentile(lengths, .5), p90: percentile(lengths, .9) },
    adoptionSamples: decisions.length,
    adoptionRate: decisions.length ? decisions.filter(row => row.adopted).length / decisions.length : null };
}
