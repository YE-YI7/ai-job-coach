/** Serialize writes to one opportunity; a rejected save must not poison retries. */
export function createOpportunitySaveQueue() {
  const pending = new Map<string, Promise<unknown>>();
  return function save<T>(id: string, write: () => Promise<T>): Promise<T> {
    const previous = pending.get(id) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(write);
    pending.set(id, next);
    void next.finally(() => {
      if (pending.get(id) === next) pending.delete(id);
    }).catch(() => undefined);
    return next;
  };
}
