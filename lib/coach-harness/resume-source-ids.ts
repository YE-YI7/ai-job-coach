/** Resolve only exact IDs or unambiguous UUID prefixes in this request's
 * allowed facts. This repairs an observed model protocol abbreviation, never
 * creates a fact or searches other users/history for a convenient citation. */
export function resolveResumeSourceIds(raw: unknown, allowed: Set<string>) {
  const ids: string[] = [], resolved: Array<{from:string;to:string}> = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    if (typeof item !== 'string') continue;
    if (allowed.has(item)) { ids.push(item); continue; }
    if (!/^[a-f0-9]{8}$/i.test(item)) continue;
    const matches = [...allowed].filter(id => /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id) && id.startsWith(item));
    if (matches.length !== 1) continue;
    ids.push(matches[0]); resolved.push({from:item,to:matches[0]});
  }
  return {ids:[...new Set(ids)],resolved};
}

/** Unselected text elsewhere cannot silently license an action in this edit. */
export function resumeEditCitationSources(before: string, sourceIds: string[], sources: Array<{id:string;text:string}>) {
  const ids = new Set(sourceIds);
  return [{ id: 'original-edit-span', text: before }, ...sources.filter(source => ids.has(source.id))];
}
