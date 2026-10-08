import { createOpportunitySaveQueue } from "./save-queue";

test("an in-flight old autosave finishes before supplemental material is persisted", async () => {
  const save = createOpportunitySaveQueue();
  let release!: () => void;
  let persisted = "";
  const old = save("job", async () => {
    await new Promise<void>(resolve => { release = resolve; });
    persisted = "old";
  });
  await Promise.resolve();
  await Promise.resolve();
  const supplemented = save("job", async () => { persisted = "old + detail"; });
  expect(persisted).toBe("");
  release();
  await Promise.all([old, supplemented]);
  expect(persisted).toBe("old + detail");
});

test("a failed save does not block retries or another opportunity", async () => {
  const save = createOpportunitySaveQueue();
  await expect(save("a", async () => { throw new Error("offline"); })).rejects.toThrow("offline");
  await expect(save("a", async () => "retry")).resolves.toBe("retry");
  await expect(save("b", async () => "independent")).resolves.toBe("independent");
});
