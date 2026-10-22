import { stableTutorMarkdownPrefix } from './tutor-format';
import {singleResumeQuestionReply} from './resume-single-question';

/** Decode only a root-level JSON reply string, never plans, evidence or reasoning.
 * This is a provisional display prefix; the existing full parser still controls
 * persistence and editing. An incomplete escape/surrogate is held for next chunk. */
function stringAt(raw: string, start: number) {
  let value = '', i = start + 1;
  for (; i < raw.length; i++) {
    const char = raw[i];
    if (char === '"') return { value, end: i + 1, complete: true };
    if (char === '\\') {
      const escaped = raw[++i];
      if (escaped === undefined) break;
      if (escaped === 'u') {
        const hex = raw.slice(i + 1, i + 5);
        if (!/^[0-9a-f]{4}$/i.test(hex)) break;
        value += String.fromCharCode(parseInt(hex, 16)); i += 4;
      } else if ('"\\/bfnrt'.includes(escaped)) value += JSON.parse(`"\\${escaped}"`);
      else break;
    } else if (char.charCodeAt(0) < 32) break;
    else value += char;
  }
  return { value: value.replace(/[\uD800-\uDBFF]$/, ''), end: i, complete: false };
}
export function resumeReplyPrefix(raw: string): string {
  const text = raw.replace(/^\s*```(?:json)?\s*/, '').trimStart();
  if (text[0] !== '{') return '';
  let i = 1, action = '', reply = '';
  const space = () => { while (/\s/.test(text[i] || '') && i < text.length) i++; };
  while (i < text.length) {
    space(); if (text[i] !== '"') break;
    const key = stringAt(text, i); if (!key.complete) break;
    i = key.end; space(); if (text[i++] !== ':') break; space();
    if (text[i] === '"') {
      const item = stringAt(text, i);
      if (key.value === 'action' && item.complete) action = item.value;
      if (key.value === 'reply') reply = item.value;
      i = item.end;
      if (!item.complete) break;
    } else {
      // Skip entire non-string values, including nested "reply" fields.
      let depth = 0;
      for (; i < text.length; i++) {
        const char = text[i];
        if (char === '"') { const item = stringAt(text, i); if (!item.complete) return ''; i = item.end - 1; }
        else if (char === '{' || char === '[') depth++;
        else if (char === '}' || char === ']') { if (!depth) break; depth--; }
        else if (char === ',' && !depth) break;
      }
    }
    space(); if (text[i++] !== ',') break;
  }
  return ['discuss', 'revise'].includes(action) && reply.length <= 2000 ? singleResumeQuestionReply(reply) : '';
}
export function resumeReplyPreview(onReply: (text: string) => void) {
  let raw = '', shown = '';
  return (delta: string) => {
    raw += delta;
    if (raw.length > 64_000) return;
    const next = stableTutorMarkdownPrefix(resumeReplyPrefix(raw));
    if (next.length > shown.length && next.startsWith(shown)) { shown = next; onReply(next); }
  };
}

/** Keep the existing request, auth, billing and CAS path. "done" is emitted only
 * after it returns a saved receipt; cancellation stops output, not a second run. */
export function resumeConversationStream(execute: (onReply: (text: string) => void) => Promise<Response>) {
  const encoder = new TextEncoder();
  let cancelled = false;
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: unknown) => { if (!cancelled) controller.enqueue(encoder.encode(JSON.stringify(event) + '\n')); };
      const heartbeat = setInterval(() => emit({ type: 'status', message: '导师正在思考…' }), 12000);
      try {
        emit({ type: 'status', message: '导师正在思考…' });
        const response = await execute(text => emit({ type: 'replace', text }));
        const result = await response.json();
        emit({ ...result, type: 'done' });
      } catch {
        emit({ type: 'done', ok: false, error: '这条消息暂未完成，输入已保留；可以重新发送。' });
      } finally { clearInterval(heartbeat); if (!cancelled) controller.close(); }
    },
    cancel() { cancelled = true; },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'private, no-store', Vary: 'Cookie, Accept', 'X-Accel-Buffering': 'no' } });
}
