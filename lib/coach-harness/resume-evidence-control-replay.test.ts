import fs from 'node:fs';
import {evidenceSource, runEvidenceComparison} from './resume-evidence-runtime';
import type {EvalSpan} from './eval-scope';
// A private local receipt is optional; user text/credentials never enter the repository.
const replay = process.env.EVIDENCE_REPLAY_FIXTURE ? test : test.skip;
replay('真实无Memory两次消息逐字回放相同；目录接线不暗改基线或新增费用', async () => {
  const data = JSON.parse(fs.readFileSync(process.env.EVIDENCE_REPLAY_FIXTURE!, 'utf8'));
  const source = evidenceSource(data.sourceRun, data.userId), spans: EvalSpan[] = [];
  let count = 0;
  const result = await runEvidenceComparison({source, arm: 'without_memory', runId: data.control.id, spans,
    checkpoint: async () => undefined,
    invoke: async (messages, phase) => {
      const original = data.control.spans[count++];
      expect(messages).toEqual(original.input.messages);
      expect(phase).toBe(original.input.phase);
      return {text: original.output, usage: original.usage};
    }});
  expect(result.status).toBe('completed'); expect(count).toBe(2); expect(result.loadedFacts).toEqual([]);
});
