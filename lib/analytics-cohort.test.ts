import { analyticsCohort } from "./analytics-cohort";
test("only explicitly configured accounts count as internal", () => {
  expect(analyticsCohort("owner", " owner, tester ")).toBe("internal");
  expect(analyticsCohort("other", "owner")).toBe("unclassified");
  expect(analyticsCohort("owner", undefined)).toBe("unclassified");
  expect(analyticsCohort(null, "owner")).toBe("unclassified");
});
test("known anonymous operator browser is marked without misclassifying another signed-in account", () => {
  expect(analyticsCohort(null, "owner", "browser", "browser")).toBe("internal");
  expect(analyticsCohort("customer", "owner", "browser", "browser")).toBe(
    "unclassified",
  );
  expect(analyticsCohort(null, "owner", "unknown", "browser")).toBe(
    "unclassified",
  );
});
