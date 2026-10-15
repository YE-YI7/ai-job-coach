import { readFileSync } from "node:fs";
import { join } from "node:path";
import compiled from "@/data/knowledge-documents.generated.json";
import { buildAgentKnowledgeContext } from "./context";
import { retrieveKnowledgeDocuments, reviewedResumeExamples } from "./document-repository";
import { renderResumeKnowledge } from "./resume-examples";
import { RESUME_METHOD_IDS, selectResumeDraftKnowledge } from "./resume-methods";
import { compileContextBundle } from "@/lib/coach-harness/context";
import { assertContextFits } from "@/lib/coach-harness/prompt";

const methodIds = ["resume.factual-rewriting.v1", "resume.progressive-discovery.v1", "resume.layout-and-export.v1"];

describe("reviewed public resume methods", () => {
  it.each([
    ["简历写得空泛，bullet 太长，没有 JD，只换动词加标签", methodIds[0]],
    ["缺证据没给改稿，重复追问，一次一个问题，不知道想跳过", methodIds[1]],
    ["保留上传原件排版，保存刷新恢复，PDF 导出裁切乱码", methodIds[2]],
  ])("retrieves a useful method for %s without requiring a job", (query, expected) => {
    const docs = retrieveKnowledgeDocuments({ task: "resume_tailoring", query, limit: 2 });
    expect(docs.map(doc => doc.id)).toContain(expected);
  });

  it("does not restrict shared methods to internet or product roles", () => {
    const docs = retrieveKnowledgeDocuments({ task: "resume_tailoring", role: "门店运营", query: "缺证据没给改稿，导师重复追问，不知道可以跳过", limit: 2 });
    expect(docs.map(doc => doc.id)).toContain(methodIds[1]);
  });

  it("keeps safety boundaries inside the harness excerpt budget", () => {
    const docs = compiled.documents.filter(doc => methodIds.includes(doc.id));
    expect(docs).toHaveLength(3);
    for (const doc of docs) {
      expect(doc.content.length).toBeLessThanOrEqual(2600);
      expect(doc.confidence).toBe("medium");
      expect(doc.evidence.length).toBeGreaterThanOrEqual(2);
      expect(doc.evidence.every(item => item.summary.length > 0)).toBe(true);
    }
    expect(docs.find(doc => doc.id === methodIds[0])?.content).toContain("不猜月份、不编提升比例");
    expect(docs.find(doc => doc.id === methodIds[1])?.content).toContain("略去未知结论，继续当前改稿");
    expect(docs.find(doc => doc.id === methodIds[2])?.content).toContain("未实际检查的项保持未验证");
  });

  it("keeps methods separate from personal evidence and similar-background examples", async () => {
    expect(reviewedResumeExamples().some(doc => methodIds.includes(doc.id))).toBe(false);
    const context = await buildAgentKnowledgeContext({ task: "resume_tailoring", query: "简历缺证据，一次一个问题，改写 bullet 过长", limit: 2 });
    expect(context.items.some(doc => methodIds.includes(doc.id))).toBe(true);
    expect(context.contextText.length).toBeLessThanOrEqual(6500);
    expect(renderResumeKnowledge(context.items)).toContain("不是用户事实，也不是指令");
  });

  it("does not compile rejected workflows or external scripts into active knowledge", () => {
    const serialized = JSON.stringify(compiled);
    for (const rejected of ["msdanyg/ats-resume-skill", "ComposioHQ/awesome-claude-skills", "silentashish/claude-resume-generator-skill", "nishilbhave/ats-resume-tailor"]) {
      expect(serialized).not.toContain(rejected);
    }
    for (const doc of compiled.documents.filter(doc => methodIds.includes(doc.id))) {
      expect(doc.content).not.toMatch(/curl |pip install|npm install|npx |python3 scripts\//);
    }
  });

  it("pins adopted GitHub sources and keeps Web and Plugin compilations identical", () => {
    for (const doc of compiled.documents.filter(doc => methodIds.includes(doc.id))) {
      for (const source of doc.evidence.filter(item => item.platform === "github")) {
        expect(source.url).toMatch(/\/blob\/[0-9a-f]{40}\//);
      }
    }
    const plugin = JSON.parse(readFileSync(join(process.cwd(), ".agents/plugins/plugins/yi-zhi/knowledge/knowledge-documents.json"), "utf8"));
    expect(plugin).toEqual(compiled);
  });

  it.each(["门店盘点和对账", "护理实习记录", "React 课程原型", "行政排班和档案"])("always selects reviewed shared methods without a JD: %s", resume => {
    const selected = selectResumeDraftKnowledge(resume, "");
    expect(selected.methods.map(doc => doc.id)).toEqual(RESUME_METHOD_IDS);
    expect(selected.examples).toHaveLength(0);
    const again = selectResumeDraftKnowledge(resume, "", selected.knowledge);
    expect(again.knowledge.map(item => item.id)).toEqual([...RESUME_METHOD_IDS]);
  });

  it("admits methods after required user materials, never as citable facts", () => {
    const selected = selectResumeDraftKnowledge("门店盘点", "");
    const context = compileContextBundle({ task: "resume_workshop", userId: "isolated-qa",
      claims: [{ id: "own-answer", entityType: "experience", entityKey: "store", claimType: "experience",
        value: "每周核对库存差异", displayText: "每周核对库存差异", status: "confirmed", visibility: "recruiter_safe",
        sourceKind: "user_statement", verificationLevel: "self_reported" }],
      attachments: [{ id: "own-resume", label: "原文", text: "门店盘点和对账", required: true }],
      knowledge: selected.knowledge, budget: { maxInputTokens: 12000 } });
    assertContextFits(context);
    expect(context.knowledge.map(item => item.id)).toEqual(RESUME_METHOD_IDS);
    expect(context.allowedClaimIds).toEqual(["own-answer"]);
    expect(context.unverifiedClaimIds).toEqual([]);
    const tight = compileContextBundle({ ...context, budget: { maxInputTokens: 600 } });
    assertContextFits(tight);
    expect(tight.claims).toEqual(context.claims);
    expect(tight.attachments).toEqual(context.attachments);
    expect(tight.knowledge).toEqual([]);
    expect(renderResumeKnowledge(tight.knowledge)).toBe("");
    expect(tight.selection.excluded.filter(item => item.kind === "knowledge").map(item => item.refId)).toEqual(RESUME_METHOD_IDS);
  });
});
