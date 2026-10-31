import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { createContextMemory, CONTEXT_MEMORY_TOOLS, type MemorySnapshot } from './context-memory';
import { createResumeMemoryCapabilities } from './resume-memory-capabilities';
import { createInMemorySemanticStore, emptySemanticState } from './semantic-memory';
import { checkEditorialEvidence, evidenceReviewPassed, parseEvidenceJson,
  RESUME_CONTRIBUTION_REVIEW_PROMPT, RESUME_EVIDENCE_EDIT_PROMPT, RESUME_EVIDENCE_HARNESS_VERSION } from './resume-evidence-contract';
import type { EvalSpan } from './eval-scope';

type Message = {role: 'system' | 'user' | 'assistant'; content: string};
type Payload = {source: string; facts: string; knowledge: string; feedback: unknown[]; contract: {request: string}};
export type EvidenceArm = 'with_memory' | 'without_memory';
type CallResult = {text: string; usage: NonNullable<EvalSpan['usage']>};
const B05_HASH = 'bf13fe89e1aaab2e7e788997ef09ccea2fffe7328e273a64a3cd8f7f796bff73';
export const EVIDENCE_CALL_LIMIT = 6;
const MEMORY_READ_TOOLS = ['memory.catalog', 'memory.find', 'memory.recall', 'context.load', 'context.release', 'context.inspect'] as const;
export const EVIDENCE_SOURCE_TRACE = '789f2b98-4fce-4755-abca-33a950e7f73b';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const blocks = (text: string) => [...text.matchAll(/^\[([^\]\n]+)\] ([\s\S]*?)(?=\n\[[^\]\n]+\] |$)/gm)]
  .map(match => ({id: match[1], text: match[2]}));
function messages(span: EvalSpan): Message[] {
  const value = (span.input as {messages?: Message[]})?.messages;
  if (!Array.isArray(value) || value.some(m => !['system', 'user', 'assistant'].includes(m.role) || typeof m.content !== 'string')) {
    throw Error('SOURCE_MESSAGES_MISSING');
  }
  return structuredClone(value);
}

/** The original private Trace is the only dataset. Neither arm reads live résumé/answers or accepts arbitrary user IDs. */
export function evidenceSource(run: {spans?: EvalSpan[]}, userId: string) {
  const editor = run.spans?.find(span => span.agent === '改稿 Agent' || span.name === '改稿 Agent');
  const gate = run.spans?.find(span => span.agent === '独立质检 Agent' || span.name === '独立质检 Agent');
  if (!editor || !gate) throw Error('SOURCE_EDITOR_OR_REVIEW_MISSING');
  const edit = messages(editor), review = messages(gate);
  const boundary = edit.find(m => m.role === 'system' && m.content.startsWith('【resume-boundary/v0.7.0-B05】'));
  if (!boundary || hash(boundary.content) !== B05_HASH) throw Error('FROZEN_BOUNDARY_MISMATCH');
  let index = -1, payload: Payload | undefined;
  edit.forEach((message, i) => {
    try {const p = JSON.parse(message.content); if (typeof p.source === 'string' && typeof p.facts === 'string' && p.contract?.request) {
      index = i; payload = p;
    }} catch { /* Other messages remain literal. */ }
  });
  if (!payload || payload.source.length > 30000) throw Error('SOURCE_PAYLOAD_MISSING');
  const p = payload as Payload;
  const reviewPayload = review.flatMap(message => {
    try {const v = JSON.parse(message.content); return typeof v.facts === 'string' ? [v as {facts: string}] : [];} catch {return [];}
  })[0];
  if (!reviewPayload) throw Error('SOURCE_FACTS_MISSING');
  const privateFacts = blocks(reviewPayload.facts).filter(block => block.id.startsWith('owned-'));
  if (!privateFacts.length || privateFacts.length > 20) throw Error('SOURCE_MEMORY_MISSING');
  // Reuse recorded catalogue labels, not newly invented business knowledge.
  const metadata = new Map<string, {title: string; category: string}>();
  for (const span of run.spans || []) for (const message of (span.input as {messages?: Message[]})?.messages || []) {
    try {
      const p = JSON.parse(message.content);
      for (const receipt of p.toolResults || []) for (const match of receipt.result?.data?.matches || []) {
        const sourceId = match.selectionEvidence?.sourceId;
        if (typeof sourceId === 'string' && typeof match.title === 'string' && typeof match.category === 'string') {
          metadata.set(sourceId, {title: match.title, category: match.category});
        }
      }
    } catch { /* Literal messages have no catalogue entries. */ }
  }
  const snapshot: MemorySnapshot = {ownerId: userId, opportunityId: null, complete: true,
    limitations: ['仅来自本次冻结Trace的项目资料，不是完整生产长期记忆库。'],
    documents: privateFacts.map(block => ({...block, ownerId: userId, opportunityId: null, kind: 'claim',
      title: metadata.get(block.id)?.title || block.text.split(/[。\n]/)[0].slice(0, 55), revision: hash(block.text), status: 'active',
      trust: 'user', canSupportFact: false, sourceIds: [EVIDENCE_SOURCE_TRACE]}))};
  const rawFacts = blocks(p.facts).filter(block => !block.id.startsWith('owned-')).map(b => `[${b.id}] ${b.text}`).join('\n');
  return {edit, review, payload: p, index, rawFacts, snapshot, boundary: boundary.content,
    sourceHash: hash(p.source), knowledgeHash: hash(p.knowledge), boundaryHash: hash(boundary.content),
    categories: Object.fromEntries([...metadata].map(([id, m]) => [id, m.category]))};
}

export async function runEvidenceComparison(input: {
  source: ReturnType<typeof evidenceSource>; arm: EvidenceArm; runId: string;
  invoke: (messages: Message[], phase: 'edit' | 'review', call: number) => Promise<CallResult>;
  spans: EvalSpan[]; checkpoint: () => Promise<void>; now?: () => number;
}) {
  const started = Date.now(), source = input.source, receipts: unknown[] = [];
  const store = createInMemorySemanticStore(emptySemanticState(source.snapshot.ownerId, null));
  const capabilities = createResumeMemoryCapabilities({store, snapshot: async () => source.snapshot,
    organizationMode: 'extractive', selectionEvidencePreview: true, maxBlocks: 20, maxStoredCharacters: 30000,
    publicTopics: [], maxSearchCalls: 0, maxSearchResults: 1, maxSearchResultCharacters: 1000});
  const memory = createContextMemory({snapshot: source.snapshot, core: {instruction: source.payload.contract.request,
    resume: source.payload.source, jd: null, boundary: {version: 'resume-boundary/v0.7.0-B05', text: source.boundary},
    model: 'deepseek-v4-flash'}, capabilities, maxContextTokens: 30000, maxToolCalls: 20, maxReadTokens: 8000,
    allowedTools: MEMORY_READ_TOOLS});
  // The test memory snapshot already exists. This is zero-model indexing, not generated or expanded facts.
  const indexed = await capabilities.prepare('memory.organize', {blocks: source.snapshot.documents.map(d => ({
    category: source.categories[d.id] || d.title.slice(0, 40), sourceIds: [d.id]}))},
    new AbortController().signal);
  await indexed.commit?.();
  let count = 0, draft: Record<string, unknown> | null = null, review: Record<string, unknown> | null = null;
  let pendingFeedback: unknown[] = [], repairRound = 0;
  const loadedFacts = async () => {
    const loaded = new Set(memory.inspect().loadedIds);
    const state = await store.read();
    return state.blocks.filter(b => loaded.has(b.id)).flatMap(b => b.evidence)
      .map(e => ({id: e.sourceId, text: e.quote}));
  };
  const facts = async () => [source.rawFacts, ...(await loadedFacts()).map(f => `[${f.id}] ${f.text}`)].filter(Boolean).join('\n');
  const call = async (ms: Message[], phase: 'edit' | 'review') => {
    if (count >= EVIDENCE_CALL_LIMIT || Date.now() - started > 235000) throw Error('EXPERIMENT_BUDGET_EXHAUSTED');
    count++;
    const span: EvalSpan = {id: randomUUID(), name: phase === 'edit' ? '改稿 Agent' : '独立质检 Agent',
      agent: phase === 'edit' ? '改稿 Agent' : '独立质检 Agent', kind: 'agent', status: 'running',
      startedAt: new Date().toISOString(), durationMs: 0, model: 'deepseek-v4-flash',
      input: {messages: ms, phase, harnessVersion: RESUME_EVIDENCE_HARNESS_VERSION}, output: null, knowledge: []};
    input.spans.push(span); await input.checkpoint();
    try {
      const result = await input.invoke(ms, phase, count);
      span.usage = result.usage; span.output = result.text; span.status = 'completed';
      const parsed = parseEvidenceJson(result.text);
      if (parsed.type === 'actions') {span.name = '编辑 Agent · 自主取材'; span.agent = '记忆选材接续';}
      return parsed;
    } catch (error) {span.status = 'failed'; throw error;}
    finally {span.durationMs = Date.now() - Date.parse(span.startedAt); await input.checkpoint();}
  };
  while (count < EVIDENCE_CALL_LIMIT - 1) {
    const currentFacts = await facts(), edit = structuredClone(source.edit);
    edit[source.index].content = JSON.stringify({...source.payload, facts: currentFacts, feedback: pendingFeedback});
    edit.push({role: 'system', content: RESUME_EVIDENCE_EDIT_PROMPT});
    edit.push({role: 'user', content: JSON.stringify({availableTools: input.arm === 'with_memory'
      ? [...capabilities.tools, ...CONTEXT_MEMORY_TOOLS].filter((t, i, a) => MEMORY_READ_TOOLS.some(name => name === t.name)
        && a.findIndex(x => x.name === t.name) === i) : [],
    memoryEnabled: input.arm === 'with_memory', toolResults: receipts,
    budget: {remainingCallsIncludingReview: EVIDENCE_CALL_LIMIT - count},
    ...(draft ? {previousCandidate: draft} : {})})});
    const output = await call(edit, 'edit');
    if (output.type === 'actions') {
      if (input.arm !== 'with_memory' || !Array.isArray(output.actions) || !output.actions.length || output.actions.length > 12) {
        throw Error('MEMORY_ACTION_NOT_ALLOWED');
      }
      for (const raw of output.actions as Array<{name: string; args: Record<string, unknown>}>) {
        if (!raw || !MEMORY_READ_TOOLS.some(name => name === raw.name)) throw Error('MEMORY_ACTION_NOT_ALLOWED');
        const result = await memory.executeAsync(raw.name, raw.args, new AbortController().signal);
        receipts.push({name: raw.name, args: raw.args, purpose: typeof output.purpose === 'string' ? output.purpose.slice(0, 160) : null, result});
        if (!result.ok) throw Error(result.error);
      }
      await input.checkpoint(); continue;
    }
    const changes = output.changes as Array<{after?: string; sourceIds?: string[]; target?: string}> | undefined;
    if (!changes || changes.length !== 1 || changes[0].target !== 'whole_project_source' || !changes[0].after?.trim()) throw Error('EDITOR_CONTRACT_INVALID');
    const evidenceErrors = checkEditorialEvidence(output.editorialPlan, currentFacts);
    const available = new Set(blocks(currentFacts).map(b => b.id));
    if (!Array.isArray(changes[0].sourceIds) || !changes[0].sourceIds.length
      || changes[0].sourceIds.some(id => !available.has(id)) || evidenceErrors.length) throw Error('EDITOR_EVIDENCE_INVALID');
    draft = output;
    const reviewMessages = structuredClone(source.review).map(message => {
      let p: Record<string, unknown>; try {p = JSON.parse(message.content);} catch {p = {};}
      if (typeof p.appliedCandidate === 'string') return {...message, content: JSON.stringify({...p, appliedCandidate: changes[0].after, facts: currentFacts})};
      if (message.content.startsWith('待审修改')) {
        const cut = message.content.indexOf('\n') + 1;
        const list = JSON.parse(message.content.slice(cut));
        return {...message, content: message.content.slice(0, cut) + JSON.stringify([{...list[0], id: input.runId,
          after: changes[0].after, sourceIds: changes[0].sourceIds}])};
      }
      if (message.content.startsWith('本轮编辑合同与计划')) return {...message,
        content: `本轮编辑合同与计划：${JSON.stringify({editorialContract: source.payload.contract, editorialPlan: output.editorialPlan})}。只依据最终稿核对。`};
      return message;
    });
    reviewMessages.push({role: 'system', content: RESUME_CONTRIBUTION_REVIEW_PROMPT});
    review = await call(reviewMessages, 'review');
    if (evidenceReviewPassed(review, input.runId)) return {status: 'completed', draft, review, repairRound,
      loadedFacts: await loadedFacts(), memory: memory.inspect(), storedBlocks: (await store.read()).blocks,
      receipts, calls: count, delivered: false};
    if (count + 2 > EVIDENCE_CALL_LIMIT) break;
    // Same editor, original B05 and exact facts; reviewer returns issues, never replacement prose.
    pendingFeedback = [review]; repairRound++;
  }
  return {status: 'failed', draft, review, repairRound, loadedFacts: await loadedFacts(),
    memory: memory.inspect(), storedBlocks: (await store.read()).blocks, receipts, calls: count, delivered: false};
}
