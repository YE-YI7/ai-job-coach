import { mentorOpening } from "./mentor-opening";
import type { Opportunity } from "./types";
test("no material starts from experience, not forced JD", () => {
  expect(mentorOpening({} as Opportunity).text).toContain("没有简历也可以");
});
test("uploaded resume is acknowledged even before JD", () => {
  expect(mentorOpening({ resumeText: "已有简历" } as Opportunity).text).toContain("不必重复讲经历");
});
test("blocked checks focus on repair and original remains an option", () => {
  expect(mentorOpening({ resumeText: "简历", jdText: "JD", applicationQuality: { status: "blocked" } } as Opportunity).text).toContain("保留原文");
});
