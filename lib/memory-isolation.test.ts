jest.mock("./db", () => ({ getDbClient: jest.fn() }));

import { getDbClient } from "./db";
import { deactivateMemory, updateMemory } from "./memory";

/**
 * 记忆写入的跨用户隔离（PRD「跨用户跨岗位不串」在记忆层的执行点）。
 * DB 客户端是 service-role、绕过 RLS，所以 `.eq('user_id', …)` 是唯一防线；
 * 这里断言的是「过滤条件真的带上了 owner」，不是断话术。
 */
function captureUpdateChain() {
  const filters: Array<[string, unknown]> = [];
  const chain: { update: jest.Mock; eq: jest.Mock; then: jest.Mock } = {
    update: jest.fn(() => chain),
    eq: jest.fn((column: string, value: unknown) => {
      filters.push([column, value]);
      return chain;
    }),
    then: jest.fn((resolve: (v: unknown) => unknown) => resolve({ data: null, error: null })),
  };
  (getDbClient as jest.Mock).mockResolvedValue({ from: jest.fn(() => chain) });
  return { chain, filters };
}

describe("记忆按 owner 收口", () => {
  it("updateMemory 同时按 id 与 user_id 过滤", async () => {
    const { chain, filters } = captureUpdateChain();
    await updateMemory("m-1", "user-a", { importance: 5 });
    expect(chain.update).toHaveBeenCalledWith({ importance: 5 });
    expect(filters).toEqual([
      ["id", "m-1"],
      ["user_id", "user-a"],
    ]);
  });

  it("停用别人的记忆 id 也带不上对方的 user_id", async () => {
    const { filters } = captureUpdateChain();
    await deactivateMemory("m-victim", "attacker");
    expect(filters).toEqual([
      ["id", "m-victim"],
      ["user_id", "attacker"],
    ]);
  });
});
