type Event = { user_id: string; event_name: string; properties?: { request_id?: string; harness_version?: string } };
/** Completed rows alone are not the denominator. Unknown/in-flight requests stay visible. */
export function requestMetrics(events: Event[]) {
  const requests = new Map<string, { version: string; states: Set<string> }>();
  for (const e of events) {
    if (!e.properties?.request_id || !e.event_name.startsWith("agent_answer_")) continue;
    const key = `${e.user_id}:${e.properties.request_id}`;
    const row = requests.get(key) || { version: "unversioned", states: new Set<string>() };
    row.states.add(e.event_name.slice("agent_answer_".length));
    if (e.properties.harness_version) row.version = e.properties.harness_version;
    requests.set(key, row);
  }
  const groups = new Map<string, Array<{ states: Set<string> }>>();
  for (const row of requests.values()) {
    if (!groups.has(row.version)) groups.set(row.version, []);
    groups.get(row.version)!.push(row);
  }
  return [...groups].map(([version, rows]) => {
    const started = rows.filter(r => r.states.has("started"));
    const completed = started.filter(r => r.states.has("completed"));
    const failed = started.filter(r => r.states.has("failed") && !r.states.has("completed"));
    const interrupted = started.filter(r => r.states.has("interrupted"));
    const adopted = completed.filter(r => r.states.has("adopted"));
    return { version, started: started.length, serverCompleted: completed.length, failed: failed.length,
      unfinished: started.filter(r => !r.states.has("completed") && !r.states.has("failed")).length,
      interrupted: interrupted.length, savedToNote: adopted.length,
      serverCompletionRate: started.length ? completed.length / started.length : null,
      interruptionRate: started.length ? interrupted.length / started.length : null,
      noteAdoptionRate: completed.length ? adopted.length / completed.length : null,
      missingStartEvents: rows.length - started.length };
  });
}
