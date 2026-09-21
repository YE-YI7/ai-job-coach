import { markdownSegments } from "./resume-markdown";

test.each([
  ["Experienced **PM** at Acme", "Experienced PM at Acme"],
  ["## **PM** and __Engineer__", "PM and Engineer"],
  ["- Built `API` with **Python**", "Built API with Python"],
  ["A **PM** - partner", "A PM - partner"],
])("保留行内空格与标点：%s", (source, expected) => {
  expect(markdownSegments(source).map((part) => part.text).join("")).toBe(expected);
  expect(markdownSegments(source).some((part) => part.bold)).toBe(true);
});
