import fs from 'node:fs';
import {evidenceSource, runEvidenceComparison} from './resume-evidence-runtime';
import {CURRENT_EVIDENCE_REQUEST} from './resume-evidence-contract';
import type {EvalSpan} from './eval-scope';
const replay = process.env.EVIDENCE_NATIVE_REPLAY ? test : test.skip;
replay('M07.2只修证据覆盖验证：已通过Memory的三次真实请求、原生工具和输出逐字相同，零新增费用', async () => {
  const data = JSON.parse(fs.readFileSync(process.env.EVIDENCE_NATIVE_REPLAY!, 'utf8'));
  const source = evidenceSource(data.sourceRun, data.ownerId);
  source.payload.contract.request = CURRENT_EVIDENCE_REQUEST;
  const original = data.completed.run, spans: EvalSpan[] = [];
  let count = 0;
  const result = await runEvidenceComparison({source, arm: 'with_memory', runId: original.id, spans,
    checkpoint: async () => undefined,
    invoke: async (messages, phase, _n, tools) => {
      const s = original.spans[count++];
      expect(messages).toEqual(s.input.messages); expect(tools).toEqual(s.input.nativeTools);
      expect(phase).toBe(s.input.phase);
      return {text: s.output, usage: s.usage};
    }});
  expect(count).toBe(3); expect(result.status).toBe('completed');
  expect(result.draft).toEqual(original.result.rawResponse.draft);
  expect(result.loadedFacts).toEqual(original.result.rawResponse.loadedFacts);
});
