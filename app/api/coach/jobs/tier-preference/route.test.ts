import { GET, PATCH } from "./route";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { readUserTierPreference, saveTierPreference } from "@/lib/coach-harness/repository";
jest.mock("@/lib/auth");
jest.mock("@/lib/coach-harness/repository");

const unset = { effectiveTiers: [], origin: "unset" as const, sourceExcerpt: null, claimId: null, pending: null };
const request = (tiers: unknown) => new Request("http://localhost/api/coach/jobs/tier-preference", { method: "PATCH", body: JSON.stringify({ tiers }) });
beforeEach(() => {
  jest.resetAllMocks();
  (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({ id: "owner" });
  (readUserTierPreference as jest.Mock).mockResolvedValue(unset);
});

test("未登录既读不到也改不了偏好", async () => {
  (getCurrentUserFromRequest as jest.Mock).mockResolvedValue(null);
  expect((await GET()).status).toBe(401);
  expect((await PATCH(request(["big_tech"]))).status).toBe(401);
  expect(readUserTierPreference).not.toHaveBeenCalled();
  expect(saveTierPreference).not.toHaveBeenCalled();
});

test("点「不限」是一条合法偏好，会照常落库并回读", async () => {
  expect((await PATCH(request([]))).status).toBe(200);
  expect(saveTierPreference).toHaveBeenCalledWith("owner", [], "在找岗位面板点的选择");
  expect(readUserTierPreference).toHaveBeenCalledWith("owner");
});

test("枚举外的档位不收，也不碰已存的偏好", async () => {
  for (const tiers of [["big_tech", "fintech"], ["big_tech", "mid_small", "non_internet", "big_tech"], "大厂", { tiers: 1 }]) {
    expect((await PATCH(request(tiers))).status).toBe(400);
  }
  expect(saveTierPreference).not.toHaveBeenCalled();
  expect((await PATCH(request(undefined))).status).toBe(400);
  expect((await PATCH(new Request("http://localhost", { method: "PATCH", body: "{" }))).status).toBe(400);
});

test("保存失败说「原设置保留」，不报成功", async () => {
  (saveTierPreference as jest.Mock).mockRejectedValue(Error("db down"));
  const response = await PATCH(request(["big_tech"]));
  expect(response.status).toBe(500);
  expect((await response.json()).error).toContain("原设置保留");
});

test("偏好是个人的：响应只带 private, no-store", async () => {
  expect((await GET()).headers.get("Cache-Control")).toBe("private, no-store");
  expect((await PATCH(request(["big_tech"]))).headers.get("Cache-Control")).toBe("private, no-store");
});
