import { getDbClient } from "@/lib/db";
import {
  captureEvalStage,
  getEvalObserver,
  withEvalObserver,
} from "./eval-scope";
import { recordWorkspaceResume, workspaceEvalEnabled } from "./workspace-eval";
jest.mock("@/lib/db", () => ({ getDbClient: jest.fn() }));
const owner = { id: "owner" },
  probe = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const request = (extra: Record<string, unknown> = {}) =>
  new Request("https://example.invalid/api/coach/resume-draft", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      resumeText: "synthetic resume",
      mode: "general_resume",
      ...extra,
    }),
  });
let previous: string | undefined;
beforeAll(() => {
  previous = process.env.EVAL_ADMIN_USER_IDS;
});
afterAll(() => {
  if (previous === undefined) delete process.env.EVAL_ADMIN_USER_IDS;
  else process.env.EVAL_ADMIN_USER_IDS = previous;
});
beforeEach(() => {
  jest.clearAllMocks();
  process.env.EVAL_ADMIN_USER_IDS = "owner";
});
function database(insertError: unknown = null, metadataError: unknown = null) {
  const snapshots: Record<string, any>[] = [],
    tables: string[] = [];
  const updateChain = {
    eq: jest.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => unknown) => resolve({ error: null }),
  };
  const metadata = {
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    maybeSingle: async () => ({
      error: metadataError,
      data: {
        properties: {
          traceId: "legacy",
          outcome: "completed",
          quality: { score: 100 },
          retrieval: { includedIds: ["method"] },
        },
      },
    }),
  };
  const insert = jest.fn(async (row) => {
    snapshots.push(structuredClone(row));
    return { error: insertError };
  });
  const db = {
    from: (table: string) => {
      tables.push(table);
      return table === "coach_eval_runs"
        ? {
            insert,
            update: (row: Record<string, unknown>) => {
              snapshots.push(structuredClone(row));
              return updateChain;
            },
          }
        : { select: () => metadata };
    },
  };
  (getDbClient as jest.Mock).mockResolvedValue(db);
  return { snapshots, tables, insert, updateChain };
}
test("only explicit account IDs enable capture, not a generic admin claim", async () => {
  expect(workspaceEvalEnabled(owner)).toBe(true);
  expect(workspaceEvalEnabled({ id: "other" })).toBe(false);
  const execute = jest.fn(async (req: Request) => {
    expect(getEvalObserver()).toBeUndefined();
    expect((await req.json()).resumeText).toBe("synthetic resume");
    return Response.json({ ok: true });
  });
  await recordWorkspaceResume({ id: "other" }, request(), execute);
  expect(execute).toHaveBeenCalledTimes(1);
  expect(getDbClient).not.toHaveBeenCalled();
});
test("an existing explicit sample scope is reused without a second run", async () => {
  await withEvalObserver({ spans: [], save: async () => {} }, () =>
    recordWorkspaceResume(owner, request(), async () =>
      Response.json({ ok: true }),
    ),
  );
  expect(getDbClient).not.toHaveBeenCalled();
});
test("real request executes once, preserves response and captures actual stage bodies privately", async () => {
  const { snapshots, tables, updateChain } = database();
  const execute = jest.fn(async (req: Request) => {
    const body = await req.json();
    expect(body.requestId).toBeTruthy();
    expect(body.opportunityId).toBeUndefined();
    captureEvalStage(
      "context",
      "compiled",
      { input: body.resumeText, output: { facts: ["source"] } },
      0,
      1,
    );
    return Response.json(
      { ok: true, previewText: "real returned draft" },
      { status: 201 },
    );
  });
  const response = await recordWorkspaceResume(owner, request(), execute);
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({
    ok: true,
    previewText: "real returned draft",
  });
  expect(response.headers.get("x-yizhi-eval-id")).toBeTruthy();
  expect(execute).toHaveBeenCalledTimes(1);
  const saved = snapshots.at(-1)!.run;
  expect(saved.source).toBe("workspace");
  expect(saved.spans[0].input).toBe("synthetic resume");
  expect(saved.result.output.previewText).toBe("real returned draft");
  expect(saved.evaluation).toBeNull();
  expect(
    tables.every((t) => ["coach_eval_runs", "product_events"].includes(t)),
  ).toBe(true);
  expect(updateChain.eq).toHaveBeenCalledWith("user_id", owner.id);
});
test("normal workspace capture fails open without altering successful business response", async () => {
  for (const setup of [
    () => database({ code: "db-down" }),
    () => {
      (getDbClient as jest.Mock).mockRejectedValue(Error("db-down"));
    },
  ]) {
    setup();
    const execute = jest.fn(async () => Response.json({ ok: true }));
    expect(
      (await recordWorkspaceResume(owner, request(), execute)).status,
    ).toBe(200);
    expect(execute).toHaveBeenCalledTimes(1);
  }
});
test("probe IDs refuse duplicate calls and storage errors before execution", async () => {
  for (const [error, status] of [
    [{ code: "23505" }, 202],
    [{ code: "db-down" }, 503],
  ] as const) {
    database(error);
    const execute = jest.fn();
    expect(
      (
        await recordWorkspaceResume(
          owner,
          request({ evalCaptureId: probe }),
          execute,
        )
      ).status,
    ).toBe(status);
    expect(execute).not.toHaveBeenCalled();
  }
  (getDbClient as jest.Mock).mockRejectedValue(Error("offline"));
  const execute = jest.fn();
  expect(
    (
      await recordWorkspaceResume(
        owner,
        request({ evalCaptureId: probe }),
        execute,
      )
    ).status,
  ).toBe(503);
  expect(execute).not.toHaveBeenCalled();
});
test("metadata lookup errors do not hide actual output", async () => {
  const { snapshots } = database(null, { message: "unavailable" });
  const response = await recordWorkspaceResume(owner, request(), async () =>
    Response.json({ ok: true }),
  );
  expect(response.status).toBe(200);
  expect(snapshots.at(-1)!.run.captureWarning).toContain("阶段摘要读取失败");
  expect(snapshots.at(-1)!.run.result.output).toEqual({ ok: true });
});
test("business errors propagate after saving a visible failed run", async () => {
  const { snapshots } = database();
  await expect(
    recordWorkspaceResume(owner, request(), async () => {
      throw Error("original");
    }),
  ).rejects.toThrow("original");
  expect(snapshots.at(-1)!.run.status).toBe("failed");
});
