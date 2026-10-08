import { splitFirstScreen, zeroCandidateState, type ZeroCandidateInput } from "./result-presentation";

/**
 * 零候选必须说清是哪种「没有」，并且每次只给一个动作；
 * 首屏至多三条，其余仍可展开看到。这两条都是判定，不是样式。
 */
const base: ZeroCandidateInput = { failedSources: [], filteredCount: 0, trackedCount: 0, tierFilterActive: false };

test("来源挂了不说成条件问题，动作是再查一次", () => {
  const state = zeroCandidateState({ ...base, failedSources: ["BOSS 直聘", "猎聘"] });
  expect(state).toMatchObject({ cause: "source_failure", action: "search_again", actionLabel: "重新查找一次" });
  expect(state.copy).toContain("BOSS 直聘、猎聘 暂时没响应");
  expect(state.copy).toContain("不是你的条件把它们筛掉了");
});

test("条件筛光了就说是条件，默认动作是看清卡在哪一条", () => {
  const state = zeroCandidateState({ ...base, filteredCount: 7 });
  expect(state.cause).toBe("constraint");
  expect([state.action, state.actionLabel]).toEqual(["show_filtered", "看它们分别卡在哪一条"]);
  expect(state.copy).toContain("7 个岗位");
});

test("设了公司档位时，先给更能立刻走通的那一步", () => {
  expect(zeroCandidateState({ ...base, filteredCount: 2, tierFilterActive: true })).toMatchObject({
    cause: "constraint", action: "relax_tiers", actionLabel: "先不设公司档位，重新找一次",
  });
});

test("真的是没货才说供给有限，并把已跟踪的条数说进去", () => {
  const plain = zeroCandidateState({ ...base, trackedCount: 3 });
  expect(plain).toMatchObject({ cause: "supply", action: "import_own_jd" });
  expect(plain.copy).toContain("读到的 3 条你已经在跟踪");
  expect(zeroCandidateState(base).copy).not.toContain("已经在跟踪");
});

test("首屏至多三条，其余进「更多候选」但不消失", () => {
  expect(splitFirstScreen([1, 2, 3, 4, 5])).toEqual({ lead: [1, 2, 3], rest: [4, 5] });
  expect(splitFirstScreen([1, 2])).toEqual({ lead: [1, 2], rest: [] });
  expect(splitFirstScreen([])).toEqual({ lead: [], rest: [] });
});
