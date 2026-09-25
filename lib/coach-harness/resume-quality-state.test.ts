import { readReviewFindings, resumeQualityStatus } from "./resume-quality-state";
const basics = [{ reviewer_type: "facts", status: "passed" }, { reviewer_type: "ats", status: "passed" }, { reviewer_type: "independent_ai", status: "not_run" }];
test("retained original stays ready after reload without a fabricated AI pass", () => {
  expect(resumeQualityStatus(true, basics)).toBe("ready");
  expect(resumeQualityStatus(false, basics)).toBe("draft");
});
test("an original version with a real failed check remains blocked", () => {
  expect(resumeQualityStatus(true, [...basics, { reviewer_type: "pdf", status: "failed" }])).toBe("blocked");
});
test("missing checks never become ready", () => expect(resumeQualityStatus(true, [])).toBe("draft"));
test("findings survive hydration; malformed entries cannot crash the UI", () => {
  expect(readReviewFindings([null, { message: {} }, { message: "核对原句", changeId: "change-1", severity: "error" }])).toEqual([{ message: "核对原句", changeId: "change-1", severity: "error" }]);
});
