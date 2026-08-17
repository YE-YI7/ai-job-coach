import cases from "@/evals/knowledge-retrieval.v1.json";
import { retrieveKnowledgeDocuments } from "./document-repository";
import type { AgentKnowledgeTask } from "./types";

describe("knowledge retrieval evaluation", () => {
  it("hits a relevant knowledge document in the top three for at least 90% of cases", () => {
    const failures: Array<{ id: string; received: string[]; expected: string[] }> = [];

    for (const testCase of cases) {
      const received = retrieveKnowledgeDocuments({
        task: testCase.task as AgentKnowledgeTask,
        query: testCase.query,
        role: testCase.role,
        company: testCase.company,
        stage: testCase.stage,
        limit: 3,
      }).map((document) => document.id);
      if (!testCase.expected_any.some((id) => received.includes(id))) {
        failures.push({ id: testCase.id, received, expected: testCase.expected_any });
      }
    }

    const hitRate = (cases.length - failures.length) / cases.length;
    expect(failures).toEqual([]);
    expect(hitRate).toBeGreaterThanOrEqual(0.9);
  });
});
