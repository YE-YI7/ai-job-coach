import {createHash} from 'node:crypto';

/** PDF bytes belong to the saved task artifact, not the transcript row. Keep
 * its identity and revision visible; never strip model/tool text or pretend
 * the binary can be recovered from this receipt alone. */
function artifactReceipts(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(artifactReceipts);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (key === 'f6Deliverables' && item && typeof item === 'object') {
      const deliverables = item as Record<string, unknown>;
      const pdf = deliverables.pdf as Record<string, unknown> | undefined;
      if (pdf && typeof pdf.base64 === 'string') {
        const {base64, ...metadata} = pdf;
        const bytes = Buffer.from(base64, 'base64');
        return [key, {...deliverables, pdf: {...metadata, binaryReceipt: {
          sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length,
          omittedFromTrace: true, reason: 'PDF 二进制不嵌入 Trace；原件见对应任务产物。',
        }}}];
      }
    }
    return [key, artifactReceipts(item)];
  }));
}

/** Lossless storage compression for cumulative native-tool messages. The
 * database caps a run at 1.5 MB; storing every prior message at every turn is
 * quadratic. Only identical message prefixes are referenced, never truncated. */
type Span = {id: string; input?: Record<string, unknown>; [key: string]: unknown};
const ENCODING = 'message-prefix-v1';

export function compactEvalTranscript(run: Record<string, unknown>) {
  run = artifactReceipts(run) as Record<string, unknown>;
  if (run.captureEncoding === ENCODING || !Array.isArray(run.spans)) return run;
  let previous: {id: string; messages: unknown[]; keys: string[]} | undefined;
  let compressed = false;
  const spans = (run.spans as Span[]).map(span => {
    const messages = span.input?.messages;
    if (!Array.isArray(messages)) return span;
    const keys = messages.map(message => JSON.stringify(message));
    let count = 0;
    while (previous && count < Math.min(keys.length, previous.keys.length)
      && keys[count] === previous.keys[count]) count++;
    const reference = previous?.id;
    previous = {id: span.id, messages, keys};
    if (!count) return span;
    compressed = true;
    return {...span, input: {...span.input, messages: messages.slice(count),
      messagesPrefix: {spanId: reference, count}}};
  });
  return compressed ? {...run, spans, captureEncoding: ENCODING} : run;
}

export function expandEvalTranscript(run: Record<string, unknown>): Record<string, unknown> {
  if (run.captureEncoding !== ENCODING || !Array.isArray(run.spans)) return run;
  const originals = new Map<string, unknown[]>();
  const spans = (run.spans as Span[]).map(span => {
    const input = span.input;
    if (!input || !Array.isArray(input.messages)) return span;
    let messages = input.messages;
    if (input.messagesPrefix) {
      const prefix = input.messagesPrefix as {spanId: string; count: number};
      const prior = originals.get(prefix.spanId);
      if (!prior || !Number.isInteger(prefix.count) || prefix.count < 1 || prefix.count > prior.length) {
        throw Error('EVAL_TRANSCRIPT_REFERENCE_INVALID');
      }
      messages = [...prior.slice(0, prefix.count), ...messages];
    }
    originals.set(span.id, messages);
    const {messagesPrefix: _reference, ...rest} = input;
    void _reference;
    return {...span, input: {...rest, messages}};
  });
  const {captureEncoding: _encoding, ...rest} = run;
  void _encoding;
  return {...rest, spans};
}
