import {createHash} from 'node:crypto';
import {F6ContextTools} from './f6-context-tools';
import {F6ToolSession} from './f6-tool-session';
import {f6AuthorDocumentProvenance} from './f6-author-document-provenance';
import {F6HrReviewSession} from './f6-hr-review';
import {f6InitialMessages, runF6ResumeWriter} from './resume-f6-writer';
import type {LlmMessage, NativeTool} from '@/lib/llm-tools';

const source = '姓名：陈甲\n2020.09—2026.06 示例大学｜本科\n整理销售台账。';
const draft = source + '\n个人综述：本科在读。';
const mentor = '暂时保留在读的原口径，请问是否毕业？';
const notes = '保留原口径并标注在读。';
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const contextTools = () => new F6ContextTools({search: jest.fn(), read: jest.fn()}, undefined,
  {complete: true, documents: []});
const write = (body: string) => ({purpose: '交付完整稿', resume_markdown: body,
  notes_markdown: notes, mentor_markdown: mentor});
const native = (body: string) => JSON.stringify({type: 'native_tool_calls', tool_calls: [{
  id: 'write', type: 'function', function: {name: 'write_output', arguments: JSON.stringify(write(body))},
}]});

test('literal comparison reconstructs both exact documents and does not accept AI notes as provenance', () => {
  const receipt = f6AuthorDocumentProvenance(source, draft, 1, ['resume-new.md', 'notes.md', 'mentor.md']);
  expect(receipt.sourceReference.sha256).toBe(sha(source));
  expect(receipt.sourceComparison.candidateSha256).toBe(sha(draft));
  const partText = (part: typeof receipt.sourceComparison.parts[number]) => part.kind === 'same'
    ? source.slice(part.sourceStart, part.sourceEnd) : part.text;
  expect(receipt.sourceComparison.parts.filter(part => part.kind !== 'add').map(partText).join('')).toBe(source);
  expect(receipt.sourceComparison.parts.filter(part => part.kind !== 'delete').map(partText).join('')).toBe(draft);
  expect(receipt.sourceComparison.parts.filter(part => part.kind === 'same').every(part => !('text' in part))).toBe(true);
  expect(receipt.sourceComparison.parts.filter(part => part.kind === 'add').map(part => part.text).join('')).toContain('本科在读');
  expect(receipt.savedArtifacts).toHaveLength(3);
  expect(receipt.savedArtifacts.every(file => file.authority === 'ai_output_not_user_statement')).toBe(true);
});

test('source remains immutable through revisions; uncertain status is not rewritten by the program', async () => {
  const session = new F6ToolSession({resume: source, jd: '', facts: [], contextTools: contextTools()}, () => [],
    undefined, undefined, undefined, true);
  const first = await session.invoke('write_output', write(draft));
  expect(first).toEqual({saved: ['resume-new.md', 'notes.md', 'mentor.md'], resumeRevision: 1});
  expect(session.deliveryState()).toMatchObject({documentProvenance: {sourceReference: {sha256: sha(source)}}});
  expect(session.outputs.get('resume-new.md')).toBe(draft); // replay is not secretly repaired
  await session.invoke('write_output', write(draft.replace('在读', '已毕业')));
  expect(session.deliveryState()).toMatchObject({documentProvenance: {sourceReference: {sha256: sha(source)}}});
  expect(session.resources['original-resume.md']).toBe(source);
  expect(session.outputs.get('resume-new.md')).toContain('已毕业'); // no date/status gate added
});

test('it is a source comparison, not a blocker for new facts from user answers or Memory', () => {
  const withNewFact = source + '\n2026年6月已毕业。';
  const result = f6AuthorDocumentProvenance(source, withNewFact, 2, ['resume-new.md']);
  expect(result.sourceComparison.policy).toBe('literal_text_difference_not_factual_verdict');
  expect(result).not.toHaveProperty('issues');
  expect(result).not.toHaveProperty('approved');
  expect(result).not.toHaveProperty('userConfirmed');
});

test('an AI editing base cannot replace the original upload as the comparison source', async () => {
  const session = new F6ToolSession({resume: draft, originalResume: source, jd: '', facts: [], contextTools: contextTools()},
    () => [], undefined, undefined, undefined, true);
  await session.invoke('write_output', write(draft));
  const provenance = session.deliveryState().documentProvenance!;
  expect(provenance.sourceReference.sha256).toBe(sha(source));
  expect(provenance.sourceReference.sha256).not.toBe(sha(draft));
});

test('Unicode offsets and an unchanged real qualifier round-trip without a status-specific rule', () => {
  const original = '🧑 姓名：陈甲\n本科在读｜预计2027.06毕业';
  for (const candidate of [original, original.replace('2027.06', '2028.06')]) {
    const {parts} = f6AuthorDocumentProvenance(original, candidate, 1, ['resume-new.md']).sourceComparison;
    expect(parts.filter(part => part.kind !== 'add').map(part => part.kind === 'same'
      ? original.slice(part.sourceStart, part.sourceEnd) : part.text).join('')).toBe(original);
    expect(parts.filter(part => part.kind !== 'delete').map(part => part.kind === 'same'
      ? original.slice(part.sourceStart, part.sourceEnd) : part.text).join('')).toBe(candidate);
  }
});

test('HR gets only its existing screening input; the same author receives source-labelled continuation state', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-11-17T12:00:00Z'));
  try {
    const input = {resume: source, jd: '', facts: [], answers: [], decisions: [], request: '',
      scope: 'whole' as const, format: {}, mentorCoaching: true as const, contextTools: contextTools()};
    const initial = f6InitialMessages(input), authorRequests: LlmMessage[][] = [];
    const catalogues: unknown[] = [], hrRequests: LlmMessage[][] = [];
    const author = jest.fn(async (messages: LlmMessage[], _phase: 'read_or_write' | 'write', _ids: string[], tools: NativeTool[]) => {
      authorRequests.push(structuredClone(messages)); catalogues.push(structuredClone(tools));
      return native(draft); // recorded wrong draft remains wrong, not claimed as a quality win
    });
    const hr = new F6HrReviewSession({resume: source, jd: '', facts: '', reviewMode: 'recruiting_screen'}, async messages => {
      hrRequests.push(structuredClone(messages)); return '毕业节点已过，请确认当前学籍。';
    });
    const output = JSON.parse(await runF6ResumeWriter(input, author, jest.fn(), undefined, undefined, undefined, hr));
    expect(author).toHaveBeenCalledTimes(2);
    expect(hrRequests).toHaveLength(1);
    expect(hrRequests[0]).toHaveLength(3);
    expect(hrRequests[0][2].content.endsWith(draft)).toBe(true);
    expect(JSON.stringify(hrRequests[0])).not.toContain('documentProvenance');
    expect(JSON.stringify(hrRequests[0])).not.toContain('user_supplied_resume');
    expect(authorRequests[0]).toEqual(initial);
    expect(authorRequests[1].slice(0, 2)).toEqual(initial);
    expect(catalogues[1]).toEqual(catalogues[0]);
    const receipts = authorRequests[1].flatMap(message => {
      try { return [JSON.parse(message.content).executionState?.deliverables?.documentProvenance].filter(Boolean); }
      catch { return []; }
    });
    expect(receipts).toHaveLength(1);
    const provenance = receipts[0] as ReturnType<typeof f6AuthorDocumentProvenance>;
    expect(provenance.sourceReference.sha256).toBe(sha(source));
    expect(provenance.sourceComparison.parts
      .filter(part => part.kind === 'add').map(part => part.text).join('')).toContain('本科在读');
    expect(JSON.parse(authorRequests[1][1].content)['resume.md']).toBe(source);
    expect(output.fullDocument).toBe(draft);
    expect(output.hrReview.finalState).toBe('author_retained_not_rechecked');
  } finally { jest.useRealTimers(); }
});

test('plain visible drafts get the same provenance without inventing a tool call or changing the author loop', async () => {
  const input = {resume: source, jd: '', facts: [], answers: [], decisions: [], request: '',
    scope: 'whole' as const, format: {}, mentorCoaching: true as const, contextTools: contextTools()};
  const requests: LlmMessage[][] = [];
  const author = jest.fn(async (messages: LlmMessage[]) => {
    requests.push(structuredClone(messages));
    return requests.length === 1 ? draft : '已核对。';
  });
  const hr = new F6HrReviewSession({resume: source, jd: '', facts: '', reviewMode: 'recruiting_screen'}, async () => '请核实学籍。');
  await runF6ResumeWriter(input, author, jest.fn(), undefined, undefined, undefined, hr);
  const state = requests[1].flatMap(message => {
    try { return [JSON.parse(message.content).executionState].filter(Boolean); } catch { return []; }
  })[0];
  expect(state.deliverables.documentProvenance.sourceReference.sha256).toBe(sha(source));
  expect(state.deliverables.documentProvenance.sourceComparison.candidateSha256).toBe(sha(draft));
  expect(requests[1].filter(message => message.role === 'tool')).toHaveLength(0);
  expect(author).toHaveBeenCalledTimes(2);
});

test('the original author can remove its unsupported status and keep a parallel question without another gate', async () => {
  const input = {resume: source, jd: '', facts: [], answers: [], decisions: [], request: '',
    scope: 'whole' as const, format: {}, mentorCoaching: true as const, contextTools: contextTools()};
  let calls = 0;
  const question = '教育日期写到2026年6月。你目前的毕业或在读状态是什么？';
  const author = jest.fn(async () => {
    calls++;
    if (calls === 1) return native(draft);
    return JSON.stringify({type: 'native_tool_calls', tool_calls: [{id: 'repair', type: 'function',
      function: {name: 'write_output', arguments: JSON.stringify({
        purpose: '撤掉AI自行增加的状态，原稿已有事实先交付', resume_markdown: source,
        mentor_markdown: question,
      })}}]});
  });
  const hr = new F6HrReviewSession({resume: source, jd: '', facts: '', reviewMode: 'recruiting_screen'},
    async () => '请确认当前学籍与到岗条件。');
  const output = JSON.parse(await runF6ResumeWriter(input, author, jest.fn(), undefined, undefined, undefined, hr));
  expect(author).toHaveBeenCalledTimes(2);
  expect(output.fullDocument).toBe(source);
  expect(output.f6Deliverables.mentorGuidance.text).toBe(question);
  expect(output.hrReview.finalState).toBe('author_revised_not_rechecked');
});
