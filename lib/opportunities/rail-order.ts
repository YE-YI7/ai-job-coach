// 左栏岗位顺序与置顶：纯本地（localStorage）维护，不依赖后端 schema。
// order = 用户拖拽后的完整 id 序列；pins = 置顶集合。展示时置顶在前，
// 两组内部都按 order 的相对顺序排列。

export function railSeq(ids: string[], order: string[]): string[] {
  const idSet = new Set(ids);
  const known = order.filter((id) => idSet.has(id));
  const knownSet = new Set(known);
  const appended = ids.filter((id) => !knownSet.has(id));
  return [...known, ...appended];
}

export function sortOpportunitiesForRail<T extends { id: string }>(
  items: T[],
  order: string[],
  pins: string[],
): T[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const seq = railSeq(items.map((item) => item.id), order);
  const pinSet = new Set(pins.filter((id) => byId.has(id)));
  const pinned = seq.filter((id) => pinSet.has(id));
  const rest = seq.filter((id) => !pinSet.has(id));
  return [...pinned, ...rest].map((id) => byId.get(id)!);
}

/** 在可见序列中把 movingId 移动到 targetId 所在位置；返回新序列（引用不变则原样返回）。 */
export function reorderIds(visible: string[], movingId: string, targetId: string): string[] {
  const from = visible.indexOf(movingId);
  const to = visible.indexOf(targetId);
  if (from < 0 || to < 0 || from === to) return visible;
  const next = [...visible];
  next.splice(from, 1);
  next.splice(to, 0, movingId);
  return next;
}

export function togglePin(pins: string[], id: string): string[] {
  return pins.includes(id) ? pins.filter((p) => p !== id) : [...pins, id];
}
