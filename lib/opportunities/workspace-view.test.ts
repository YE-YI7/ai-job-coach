import { readWorkspaceView, saveWorkspaceView, workspaceViewKey } from "./workspace-view";

function storage(value: string | null = null) {
  return { getItem: jest.fn(() => value), setItem: jest.fn() };
}
test("navigation is isolated by signed-in account and disabled without an owner", () => {
  expect(workspaceViewKey("one")).not.toBe(workspaceViewKey("two"));
  expect(workspaceViewKey()).toBeNull();
  expect(workspaceViewKey(" ")).toBeNull();
});
test("refresh restores the same owned opportunity and interview view", () => {
  expect(readWorkspaceView(storage('{"opportunityId":"qa","tab":"interview"}'), "key", ["base", "qa"]))
    .toEqual({ opportunityId: "qa", tab: "interview" });
});
test("an explicit URL tab takes priority over the previous tab", () => {
  expect(readWorkspaceView(storage('{"opportunityId":"qa","tab":"interview"}'), "key", ["qa"], "resume"))
    .toEqual({ opportunityId: "qa", tab: "resume" });
});
test.each([null, "bad json", "[]", '{"opportunityId":"deleted","tab":"interview"}', '{"opportunityId":"qa","tab":"unknown"}'])
("stale, unowned and malformed views safely fall back: %s", (value) => {
  expect(readWorkspaceView(storage(value), "key", ["qa"])).toBeNull();
});
test("writes only minimal navigation for an owned opportunity", () => {
  const store = storage();
  saveWorkspaceView(store, "key", { opportunityId: "qa", tab: "interview" }, ["qa"]);
  expect(store.setItem).toHaveBeenCalledWith("key", '{"opportunityId":"qa","tab":"interview"}');
  saveWorkspaceView(store, "key", { opportunityId: "other-account", tab: "interview" }, ["qa"]);
  expect(store.setItem).toHaveBeenCalledTimes(1);
});
test("storage read/write failures do not break the interview", () => {
  const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  expect(readWorkspaceView(blocked, "key", ["qa"])).toBeNull();
  expect(() => saveWorkspaceView(blocked, "key", { opportunityId: "qa", tab: "interview" }, ["qa"])).not.toThrow();
});
