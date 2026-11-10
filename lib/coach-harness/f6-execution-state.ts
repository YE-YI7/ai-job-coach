import {createHash} from 'node:crypto';
import type {LlmMessage} from '@/lib/llm-tools';

/** Transport state, not a writing plan. Originals stay in the transcript once;
 * repeated immutable reads point to that exact tool result, never a summary. */
export function f6CallMessages(history: LlmMessage[], completed: number, limit: number) {
  const messages = structuredClone(history);
  // Preserve the accepted first request byte for byte. State starts when an
  // actual author turn has completed, not as a replacement writing prompt.
  if (completed === 0) return messages;
  const reads = new Map<string, {file: string; sha256: string; firstToolCallId: string; reads: number}>();
  let duplicateReads = 0;
  for (const message of messages) {
    if (message.role !== 'tool' || !message.tool_call_id) continue;
    let result;
    try { result = JSON.parse(message.content); } catch { continue; }
    if (!result || typeof result.file !== 'string' || typeof result.text !== 'string' || result.error) continue;
    const sha256 = createHash('sha256').update(result.text).digest('hex');
    const key = JSON.stringify([result.file, sha256]);
    const prior = reads.get(key);
    if (prior) {
      prior.reads++;
      duplicateReads++;
      const {text: _duplicate, ...receipt} = result;
      void _duplicate;
      message.content = JSON.stringify({...receipt, readStatus: 'already_read_unchanged',
        textReference: {toolCallId: prior.firstToolCallId, sha256},
        note: '同一版本原文已完整返回，见所引用的工具回执；这次没有新增材料。'});
    } else {
      reads.set(key, {file: result.file, sha256, firstToolCallId: message.tool_call_id, reads: 1});
    }
  }
  const executionState = {
    source: 'host_execution_state',
    authorCalls: {limit, completed, remainingIncludingThisCall: Math.max(0, limit - completed)},
    readFiles: [...reads.values()], duplicateReads,
    note: '这是执行状态，不是简历事实或固定步骤。调用额度不会因换工具或重读而恢复。'
      + '已读原文仍在本对话的对应回执里；自行判断材料是否足够，以及继续取证、交稿或提出关键问题。',
  };
  // Keep the system, tool catalogue and native tool-call/result pairing intact.
  const last = messages.at(-1);
  if (last && (last.role === 'tool' || last.role === 'user')) {
    try {
      const payload = JSON.parse(last.content);
      if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
        last.content = JSON.stringify({...payload, executionState});
        return messages;
      }
    } catch { /* Non-JSON checkpoint: append state without rewriting its text. */ }
  }
  messages.push({role: 'user', content: JSON.stringify({executionState})});
  return messages;
}
