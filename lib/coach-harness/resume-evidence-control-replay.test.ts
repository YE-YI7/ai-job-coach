import fs from 'node:fs';
import {evidenceSource, runEvidenceComparison} from './resume-evidence-runtime';
import {CURRENT_EVIDENCE_REQUEST} from './resume-evidence-contract';
import type {EvalSpan} from './eval-scope';
// A private local receipt is optional; user text/credentials never enter the repository.
const replay = process.env.EVIDENCE_REPLAY_FIXTURE ? test : test.skip;
replay('恢复最新目标后旧基线不可冒充相同输入；原稿和B05仍相同', async () => {
  const data = JSON.parse(fs.readFileSync(process.env.EVIDENCE_REPLAY_FIXTURE!, 'utf8'));
  const source = evidenceSource(data.sourceRun, data.userId), spans: EvalSpan[] = [];
  const original = structuredClone(source);
  source.payload.contract.request = CURRENT_EVIDENCE_REQUEST;
  let count = 0;
  await expect(runEvidenceComparison({source, arm: 'without_memory', runId: data.control.id, spans,
    checkpoint: async () => undefined,
    invoke: async (messages, phase) => {
      const oldCall = data.control.spans[count++];
      expect(messages).not.toEqual(oldCall.input.messages);
      expect(phase).toBe('edit');
      expect(messages.find(m => {try {return JSON.parse(m.content).contract?.request === CURRENT_EVIDENCE_REQUEST;} catch {return false;}})).toBeDefined();
      throw Error('FRESH_CONTROL_REQUIRED_NO_MODEL_CALLED');
    }})).rejects.toThrow('FRESH_CONTROL_REQUIRED_NO_MODEL_CALLED');
  expect(count).toBe(1); expect(source.payload.source).toBe(original.payload.source); expect(source.boundary).toBe(original.boundary);
});
