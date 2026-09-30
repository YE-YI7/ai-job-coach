import { checkSourcePointers, interviewMaterials } from "./question-lineage";
import { compileContextBundle } from "@/lib/coach-harness";
test("来源类别不能假冒：对应原文或真实refId才通过", () => {
  const materials = { jd: [{ id: "jd-1", text: "发现用户问题" }], resume: [{ id: "resume-1", text: "记录排队时长" }] };
  expect(checkSourcePointers([{ source: "jd", pointer: "[jd-1]" }, { source: "resume", pointer: "记录排队时长" }], materials)).toEqual([]);
  expect(checkSourcePointers([{ source: "research", pointer: "jd-1" }, { source: "resume", pointer: "获奖项目" }], materials)).toHaveLength(2);
});
test("未装载/裁剪掉的知识和材料不能成为来源", () => {
  const context = compileContextBundle({ userId: "owner", task: "mock_interview", claims: [], attachments: [{ id: "interview-jd", label: "JD", text: "发现用户问题", required: true }], budget: { maxInputTokens: 2000 } });
  const materials = interviewMaterials(context);
  expect(checkSourcePointers([{ source: "resume", pointer: "resume-text" }], materials)).toHaveLength(1);
  expect(materials.jd).toEqual([{ id: "interview-jd", text: "发现用户问题" }]);
});
