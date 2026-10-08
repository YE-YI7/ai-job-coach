import { getDbClient } from "@/lib/db";
import { createCockpitOpportunity } from "./repository";
import type { Opportunity } from "@/lib/opportunities/types";
jest.mock("@/lib/db");
jest.mock("./run-ledger/events", () => ({ intakeEvent: jest.fn() }));

test("mixed uploaded and supplemental lines supply non-null provenance on every inserted row", async () => {
  const claims: unknown[] = [];
  const db = { from: jest.fn((table: string) => {
    const chain: Record<string, jest.Mock> = {};
    for (const method of ["select", "eq", "is", "limit", "order"]) chain[method] = jest.fn(() => chain);
    chain.insert = jest.fn((rows) => { if (table === "coach_claims") claims.push(...rows); return chain; });
    chain.single = jest.fn().mockResolvedValue({ data: { id: "new-source" }, error: null });
    chain.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
    chain.then = jest.fn((resolve) => Promise.resolve({ data: [], error: null }).then(resolve));
    return chain;
  }) };
  (getDbClient as jest.Mock).mockResolvedValue(db);
  await createCockpitOpportunity("owner", { company: "测试", role: "运营", stage: "captured", workspaceType: "preparation", resumeText: "原简历经历\n补充经历（用户提供，待核实）：\n补充经历" } as Omit<Opportunity, "id">);
  expect(claims).toEqual([
    expect.objectContaining({ value: "原简历经历", source_kind: "user_upload", verification_level: "self_reported", status: "confirmed" }),
    expect.objectContaining({ value: "补充经历", source_kind: "user_statement", verification_level: "self_reported", status: "unverified", confirmed_at: null }),
  ]);
});
