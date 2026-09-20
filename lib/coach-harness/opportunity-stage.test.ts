import { getDbClient } from "@/lib/db";
import { updateCockpitOpportunity, updateCockpitOpportunityStage } from "./repository";
import type { Opportunity } from "@/lib/opportunities/types";
jest.mock("@/lib/db");

function database(data: unknown) {
  const chain: Record<string, jest.Mock> = {};
  for (const method of ["select", "eq", "update"]) chain[method] = jest.fn(() => chain);
  chain.maybeSingle = jest.fn().mockResolvedValue({ data, error: null });
  chain.then = jest.fn((resolve) => Promise.resolve({ error: null }).then(resolve));
  (getDbClient as jest.Mock).mockResolvedValue({ from: jest.fn(() => chain) });
  return chain;
}
beforeEach(() => jest.resetAllMocks());
test("阶段更新只写stage和时间，限制owner并确认实际命中", async () => {
  const db = database({ id: "job" });
  await updateCockpitOpportunityStage("owner", "job", "won");
  expect(db.update).toHaveBeenCalledWith({ stage: "won", updated_at: expect.any(String) });
  expect(db.eq).toHaveBeenCalledWith("user_id", "owner");
  expect(db.eq).toHaveBeenCalledWith("id", "job");
});
test("删除或不属于用户的岗位不能假报成功", async () => {
  database(null);
  await expect(updateCockpitOpportunityStage("owner", "job", "won")).rejects.toThrow("不存在");
});
test("后台保存正文不把旧阶段写回数据库", async () => {
  const db = database({ jd_text: "JD", jd_version: 1, metadata: { resumeText: "简历" } });
  await updateCockpitOpportunity("owner", { id: "job", company: "公司", role: "PM", stage: "applied", jdText: "JD", resumeText: "简历" } as Opportunity, true);
  expect(db.update.mock.calls[0][0]).not.toHaveProperty("stage");
  expect(db.update.mock.calls[0][0].metadata.resumeText).toBe("简历");
});
