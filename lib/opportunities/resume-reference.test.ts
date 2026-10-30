import {
  makeResumeReference,
  referencePointer,
  resolveResumeReference,
  resumeReferenceContext,
} from "./resume-reference";
import type { ResumeChange } from "./types";

const before = "整理需求记录，交给产品经理每周核对。";
const change: ResumeChange = {
  id: "change-one",
  section: "项目经历",
  before,
  after: "整理需求记录，供产品经理每周核对。",
  reason: "删掉冗余",
  status: "pending",
  evidenceId: null,
};
const source = {
  id: "opportunity-one",
  resumeRevision: "rev-one",
  resumeText: `## 项目经历\n${before}`,
  resumeChanges: [change],
};

test("代码给出精确源区间；原文/建议都保留，引用没有改变输入或决定", async () => {
  const snapshot = JSON.stringify(source),
    ref = await makeResumeReference(source, change.id);
  expect(source.resumeText.slice(ref.start, ref.end)).toBe(before);
  expect(ref.after).toBe(change.after);
  expect(await resolveResumeReference(referencePointer(ref), source)).toEqual(
    ref,
  );
  expect(resumeReferenceContext(ref)).toContain("不是已确认经历");
  expect(resumeReferenceContext(ref)).toContain("sourceStart");
  expect(JSON.stringify(source)).toBe(snapshot);
  expect(Object.keys(referencePointer(ref)).sort()).toEqual(
    [
      "version",
      "opportunityId",
      "revision",
      "changeId",
      "sourceHash",
      "changeHash",
    ].sort(),
  );
});
test.each(["revision", "source", "suggestion", "decision"])(
  "旧%s不能悄悄套到新稿",
  async (kind) => {
    const ref = await makeResumeReference(source, change.id);
    const updated = { ...source, resumeChanges: [{ ...change }] };
    if (kind === "revision") updated.resumeRevision = "rev-two";
    if (kind === "source") updated.resumeText += "\n另一段新增内容。";
    if (kind === "suggestion") updated.resumeChanges[0].after = "不同的建议。";
    if (kind === "decision") updated.resumeChanges[0].status = "accepted";
    await expect(resolveResumeReference(ref, updated)).rejects.toThrow(
      "已更新",
    );
  },
);
test("跨岗位、伪造哈希和非法格式不做相似句猜测", async () => {
  const ref = await makeResumeReference(source, change.id);
  await expect(
    resolveResumeReference(ref, { ...source, id: "other-opportunity" }),
  ).rejects.toThrow("另一份");
  await expect(
    resolveResumeReference({ ...ref, sourceHash: "0".repeat(64) }, source),
  ).rejects.toThrow("已更新");
  await expect(
    resolveResumeReference({ ...ref, version: 999 }, source),
  ).rejects.toThrow("格式无效");
});
test("重复原句和重叠建议不能唯一定位时拒绝；不拿第一个匹配冒充定位", async () => {
  await expect(
    makeResumeReference(
      { ...source, resumeText: `${before}\n${before}` },
      change.id,
    ),
  ).rejects.toThrow("不能唯一定位");
  await expect(
    makeResumeReference(
      { ...source, resumeChanges: [change, { ...change, id: "overlap" }] },
      change.id,
    ),
  ).rejects.toThrow("不能唯一定位");
  await expect(
    makeResumeReference(
      { ...source, resumeChanges: [change, change] },
      change.id,
    ),
  ).rejects.toThrow("已变化");
});
