import { readFileSync } from "node:fs";
test("公开发布知识库不含私有课程入口或培训素材", () => {
  for (const path of ["knowledge-base/manifest.json", "data/job-knowledge.seed.json", "data/knowledge-documents.generated.json", ".agents/plugins/plugins/yi-zhi/knowledge/knowledge-documents.json"]) {
    const text = readFileSync(path, "utf8");
    expect(text).not.toMatch(/km\.woa\.com|internal_course|腾讯内部「Harness|CAR 成本-自主-可靠/);
  }
});
