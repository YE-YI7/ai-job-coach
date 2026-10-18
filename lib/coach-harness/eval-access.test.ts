import { isEvalAdmin, readEvalAssessment } from "./eval-access";
const original = process.env.ADMIN_EMAILS;
afterAll(() => {
  if (original === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = original;
});
test("existing explicit email allowlist only, never user metadata", () => {
  process.env.ADMIN_EMAILS = "OWNER@example.invalid";
  expect(isEvalAdmin({ email: "owner@example.invalid" })).toBe(true);
  expect(isEvalAdmin({ email: "other@example.invalid" })).toBe(false);
  process.env.ADMIN_EMAILS = "";
  expect(isEvalAdmin({ email: "owner@example.invalid" })).toBe(false);
});
test("LLM assessment must carry a bounded numeric score and a real reason", () => {
  const good = {
    score: 45,
    reason: "整稿仍保留泛化自评。",
    problemType: "quality",
    missingInformation: [],
    groundingVeto: true,
  };
  expect(readEvalAssessment(JSON.stringify(good))).toMatchObject({
    score: 45,
    source: "llm_self_eval",
    groundingVeto: true,
  });
  for (const score of [-1, 101, "99"])
    expect(() =>
      readEvalAssessment(JSON.stringify({ ...good, score })),
    ).toThrow();
  expect(() =>
    readEvalAssessment(JSON.stringify({ ...good, problemType: "constructor" })),
  ).toThrow();
  expect(() =>
    readEvalAssessment(JSON.stringify({ ...good, missingInformation: [{}] })),
  ).toThrow();
});
test("eval-specific server user ID allowlist does not trust email or metadata", () => {
  const old = process.env.EVAL_ADMIN_USER_IDS;
  try {
    process.env.ADMIN_EMAILS = "";
    process.env.EVAL_ADMIN_USER_IDS = "verified-owner";
    expect(isEvalAdmin({ id: "verified-owner" })).toBe(true);
    expect(isEvalAdmin({ id: "other", email: "verified-owner" })).toBe(false);
  } finally {
    if (old === undefined) delete process.env.EVAL_ADMIN_USER_IDS;
    else process.env.EVAL_ADMIN_USER_IDS = old;
  }
});
