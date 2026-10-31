import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { createContextMemory, type MemorySnapshot } from './context-memory';
import { createResumeMemoryCapabilities } from './resume-memory-capabilities';
import { createInMemorySemanticStore, emptySemanticState } from './semantic-memory';
import { checkEditorialEvidence, evidenceReviewPassed, parseEvidenceJson,
  RESUME_CONTRIBUTION_REVIEW_PROMPT, RESUME_EVIDENCE_EDIT_PROMPT, RESUME_EVIDENCE_HARNESS_VERSION,
  MEMORY_DISCOVERY_INSTRUCTION } from './resume-evidence-contract';
import type { EvalSpan } from './eval-scope';
import type {LlmMessage, NativeTool, NativeToolCall} from '@/lib/llm-tools';
import {evidenceEditorTools, EVIDENCE_NATIVE_NAMES, NATIVE_EDIT_INSTRUCTION,
  citationIssues, applyCitationRepair} from './resume-evidence-tools';
import {GROUNDING_EVIDENCE_INSTRUCTION, groundingEvidenceIssues} from './resume-evidence-review';

type Message = LlmMessage;
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
  invoke: (messages: Message[], phase: 'edit' | 'review', call: number, tools?: NativeTool[]) => Promise<CallResult>;
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
  const discovery = (await store.read()).blocks.map(block => ({id: block.id, revision: block.revision,
    category: block.category, title: block.title, description: block.description, previewOnly: true}));
  let count = 0, draft: Record<string, unknown> | null = null, review: Record<string, unknown> | null = null;
  let pendingFeedback: unknown[] = [], repairRound = 0;
  const history: Message[] = [];
  const loadedFacts = async () => {
    const loaded = new Set(memory.inspect().loadedIds);
    const state = await store.read();
    return state.blocks.filter(b => loaded.has(b.id)).flatMap(b => b.evidence)
      .map(e => ({id: e.sourceId, text: e.quote}));
  };
  const facts = async () => [source.rawFacts, ...(await loadedFacts()).map(f => `[${f.id}] ${f.text}`)].filter(Boolean).join('\n');
  const call = async (ms: Message[], phase: 'edit' | 'review', tools?: NativeTool[]) => {
    if (count >= EVIDENCE_CALL_LIMIT || Date.now() - started > 235000) throw Error('EXPERIMENT_BUDGET_EXHAUSTED');
    count++;
    const span: EvalSpan = {id: randomUUID(), name: phase === 'edit' ? '改稿 Agent' : '独立质检 Agent',
      agent: phase === 'edit' ? '改稿 Agent' : '独立质检 Agent', kind: 'agent', status: 'running',
      startedAt: new Date().toISOString(), durationMs: 0, model: 'deepseek-v4-flash',
      input: {messages: ms, ...(tools ? {nativeTools: tools} : {}), phase,
        harnessVersion: RESUME_EVIDENCE_HARNESS_VERSION}, output: null, knowledge: []};
    input.spans.push(span); await input.checkpoint();
    try {
      const result = await input.invoke(ms, phase, count, tools);
      span.usage = result.usage; span.output = result.text; span.status = 'completed';
      const parsed = parseEvidenceJson(result.text);
      if (parsed.type === 'actions' || (parsed.type === 'native_tool_calls' && (parsed.tool_calls as NativeToolCall[])
        .some(t => EVIDENCE_NATIVE_NAMES[t.function.name]))) {
        span.name = '编辑 Agent · 自主取材'; span.agent = '记忆选材接续';
      }
      return parsed;
    } catch (error) {
      span.status = 'failed';
      span.code = error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'MODEL_PHASE_FAILED';
      throw error;
    }
    finally {span.durationMs = Date.now() - Date.parse(span.startedAt); await input.checkpoint();}
  };
  while (count < EVIDENCE_CALL_LIMIT - 1) {
    const currentFacts = await facts(), edit = structuredClone(source.edit);
    edit[source.index].content = JSON.stringify({...source.payload, facts: currentFacts, feedback: pendingFeedback});
    // Remove only the superseded text-output interface, not the frozen B05/content boundary.
    const legacyInterface = edit.findIndex(m => m.role === 'system'
      && m.content.includes('target固定为whole_project_source'));
    if (legacyInterface >= 0) edit.splice(legacyInterface, 1);
    edit.push({role: 'system', content: RESUME_EVIDENCE_EDIT_PROMPT.split('当前可用工具')[0]});
    if (input.arm === 'with_memory') edit.push({role: 'system', content: MEMORY_DISCOVERY_INSTRUCTION});
    edit.push({role: 'system', content: NATIVE_EDIT_INSTRUCTION});
    edit.push({role: 'user', content: JSON.stringify({
    memoryEnabled: input.arm === 'with_memory', toolResults: receipts,
    ...(input.arm === 'with_memory' ? {availableMemoryIndex: discovery} : {}),
    budget: {remainingCallsIncludingReview: EVIDENCE_CALL_LIMIT - count},
    ...(draft ? {previousCandidate: draft} : {})})});
    edit.push(...history);
    const tools = evidenceEditorTools({facts: currentFacts, memoryEnabled: input.arm === 'with_memory',
      loaded: (await loadedFacts()).length > 0, index: discovery});
    let output = await call(edit, 'edit', tools);
    let submission: NativeToolCall | undefined, submissionAnswered = false;
    if (output.type === 'native_tool_calls') {
      const calls = output.tool_calls as NativeToolCall[];
      if (calls.some(c => c.function.name === 'submit_edit') && calls.length !== 1) throw Error('MIXED_SUBMISSION_NOT_ALLOWED');
      history.push({role: 'assistant', content: String(output.content || ''), tool_calls: calls});
      submission = calls.find(c => c.function.name === 'submit_edit');
      if (submission) output = JSON.parse(submission.function.arguments);
      else {
        for (const c of calls) {
          const name = EVIDENCE_NATIVE_NAMES[c.function.name];
          if (input.arm !== 'with_memory' || !name) throw Error('MEMORY_ACTION_NOT_ALLOWED');
          const args = JSON.parse(c.function.arguments);
          const result = await memory.executeAsync(name, args, new AbortController().signal);
          receipts.push({name, args, toolCallId: c.id, result});
          history.push({role: 'tool', tool_call_id: c.id, content: JSON.stringify(result)});
          if (!result.ok) throw Error(result.error);
        }
        await input.checkpoint(); continue;
      }
    }
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
    // Missing an optional policy explanation must never trigger five full-résumé rewrites.
    // Zero reads are recorded as non-activation, not invented loading or an invalid user draft.
    if (!changes || changes.length !== 1 || changes[0].target !== 'whole_project_source' || !changes[0].after?.trim()) throw Error('EDITOR_CONTRACT_INVALID');
    const available = new Set(blocks(currentFacts).map(b => b.id));
    if (!Array.isArray(changes[0].sourceIds) || !changes[0].sourceIds.length
      || changes[0].sourceIds.some(id => !available.has(id))) throw Error('EDITOR_EVIDENCE_INVALID');
    let issues = citationIssues(output.editorialPlan, currentFacts);
    if (issues.length) {
      if (submission) {
        history.push({role: 'tool', tool_call_id: submission.id,
          content: JSON.stringify({status: 'citation_protocol_error', issues, repairScope: 'evidence_only_body_frozen'})});
        submissionAnswered = true;
      }
      if (count + 2 > EVIDENCE_CALL_LIMIT) {
        return {status: 'failed', draft: output, review, reason: 'EDITOR_EVIDENCE_INVALID',
          loadedFacts: await loadedFacts(), receipts, calls: count, delivered: false};
      }
      const patch = await call([...edit, {role: 'user', content: JSON.stringify({
        citationRepairOnly: true, issues, previousCandidate: output,
        instruction: '只修引用；候选正文冻结，不要重新改稿。',
      })}], 'edit', evidenceEditorTools({facts: currentFacts, memoryEnabled: false,
        loaded: false, index: [], citationRepairOnly: true}));
      const patchCalls = patch.tool_calls as NativeToolCall[];
      const args = patch.type === 'native_tool_calls' && patchCalls.length === 1
        && patchCalls[0].function.name === 'repair_evidence' ? JSON.parse(patchCalls[0].function.arguments) : patch;
      output = applyCitationRepair(output, args);
      issues = citationIssues(output.editorialPlan, currentFacts);
      if (issues.length || checkEditorialEvidence(output.editorialPlan, currentFacts).length) throw Error('EDITOR_EVIDENCE_INVALID');
    }
    draft = output;
    const reviewMessages = structuredClone(source.review).map(message => {
      let p: Record<string, unknown>; try {p = JSON.parse(message.content);} catch {p = {};}
      if (typeof p.appliedCandidate === 'string') return {...message, content: JSON.stringify({...p,
        appliedCandidate: changes[0].after, facts: currentFacts, editingRequest: source.payload.contract.request,
        styleContract: {...(p.styleContract as Record<string, unknown> || {}), editorialContract: source.payload.contract}})};
      if (message.content.startsWith('待审修改')) {
        const cut = message.content.indexOf('\n') + 1;
        const list = JSON.parse(message.content.slice(cut));
        return {...message, content: message.content.slice(0, cut) + JSON.stringify([{...list[0], id: input.runId,
          before: source.payload.source, after: changes[0].after, sourceIds: changes[0].sourceIds}])};
      }
      if (message.content.startsWith('本轮编辑合同与计划')) return {...message,
        content: `本轮编辑合同与计划：${JSON.stringify({editorialContract: source.payload.contract, editorialPlan: output.editorialPlan})}。只依据最终稿核对。`};
      return message;
    });
    reviewMessages.push({role: 'system', content: RESUME_CONTRIBUTION_REVIEW_PROMPT});
    reviewMessages.push({role: 'system', content: GROUNDING_EVIDENCE_INSTRUCTION});
    review = await call(reviewMessages, 'review');
    let proofIssues = groundingEvidenceIssues(review, currentFacts, changes[0].after);
    if (proofIssues.length && count < EVIDENCE_CALL_LIMIT) {
      review = await call([...reviewMessages, {role: 'assistant', content: JSON.stringify(review)},
        {role: 'user', content: JSON.stringify({reviewProtocolIssues: proofIssues,
          instruction: '同一候选冻结。只纠正诊断证据协议，不写替换正文，不把旧失败自动改通过。'})}], 'review');
      proofIssues = groundingEvidenceIssues(review, currentFacts, changes[0].after);
    }
    if (proofIssues.length) return {status: 'failed', draft, review, reason: 'REVIEW_EVIDENCE_INVALID',
      loadedFacts: await loadedFacts(), receipts, calls: count, delivered: false};
    if (evidenceReviewPassed(review, input.runId)) {
      const loaded = await loadedFacts(), activated = input.arm !== 'with_memory' || loaded.length > 0;
      return {status: activated ? 'completed' : 'failed', draft, review, repairRound,
        experimentValidity: {activated, reason: activated ? 'actual_input_recorded' : 'memory_not_loaded_not_an_effective_memory_arm'},
        loadedFacts: loaded, memory: memory.inspect(), storedBlocks: (await store.read()).blocks,
        receipts, calls: count, delivered: false};
    }
    if (count + 2 > EVIDENCE_CALL_LIMIT) break;
    // Same editor, original B05 and exact facts; reviewer returns issues, never replacement prose.
    if (submission) history.push(submissionAnswered
      ? {role: 'user', content: JSON.stringify({status: 'needs_revision', review})}
      : {role: 'tool', tool_call_id: submission.id, content: JSON.stringify({status: 'needs_revision', review})});
    pendingFeedback = [review]; repairRound++;
  }
  return {status: 'failed', draft, review, repairRound, loadedFacts: await loadedFacts(),
    experimentValidity: {activated: input.arm !== 'with_memory' || (await loadedFacts()).length > 0},
    memory: memory.inspect(), storedBlocks: (await store.read()).blocks, receipts, calls: count, delivered: false};
}
