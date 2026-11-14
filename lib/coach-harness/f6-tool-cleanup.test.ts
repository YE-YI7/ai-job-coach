import {F6ContextTools, type F6MemoryDocument} from './f6-context-tools';
import {F6ToolSession} from './f6-tool-session';
import {f6InitialMessages} from './resume-f6-writer';
import {runF6ResumeWriter} from './resume-f6-writer';
import {f6OfficialLlmOptions, assertF6OfficialServedModel} from './f6-model-policy';
const resume = '周宁\n求职方向：AI产品经理\n参与知识助手试点。';
const extra: F6MemoryDocument = {id: '11111111-1111-4111-8111-111111111111',
  text: '我比对两版报价，发现旧版条款被当作当前条款。', sourceId: 'statement',
  sourceKind: 'user_statement', status: 'unverified', updatedAt: '2026-11-13T00:00:00Z',
  verification: 'user_report_not_independently_verified'};
const input = {resume, jd: '', facts: [], request: '', answers: [], decisions: [], scope: 'whole' as const,
  format: {}, mentorCoaching: true as const};
const reader = {search: jest.fn(), read: jest.fn()};
test('complete materials are supplied once with provenance and remove redundant Memory tools', async () => {
  const contextTools = new F6ContextTools(reader, undefined, {complete: true, documents: [extra, extra]});
  const messages = f6InitialMessages({...input, contextTools});
  const payload = JSON.parse(messages[1].content);
  expect(payload.personalMaterials).toEqual([extra]);
  expect(payload.contextAccess.personalMemory).toMatchObject({complete: true, preloaded: true});
  expect(payload).not.toHaveProperty('facts.md');
  expect(payload).not.toHaveProperty('public_hiring_case_notes');
  expect(messages[0].content).not.toContain('memory_decision');
  expect(messages[0].content).not.toContain('规格地图');
  const session = new F6ToolSession({...input, contextTools}, () => [], undefined, undefined, undefined, true);
  const tools = session.availableTools();
  expect(tools).toHaveLength(7);
  expect(tools.some(tool => tool.function.name.startsWith('memory_'))).toBe(false);
  await expect(session.invoke('memory_search', {query: '报价'})).rejects.toThrow('MEMORY_ALREADY_PRELOADED');
});
test('partial/unknown material coverage keeps Memory and does not present a partial pack as complete', () => {
  const contextTools = new F6ContextTools(reader, undefined, {complete: false, documents: []});
  const session = new F6ToolSession({...input, contextTools}, () => [], undefined, undefined, undefined, true);
  expect(session.availableTools()).toHaveLength(9);
  expect(JSON.parse(f6InitialMessages({...input, contextTools})[1].content)
    .contextAccess.personalMemory.complete).toBe(false);
});
test('actual writer session retains owned supplemental material even when there is no chat-answer history', async () => {
  const contextTools = new F6ContextTools(reader, undefined, {complete: true, documents: [extra]});
  const invoke = F6ToolSession.prototype.invoke;
  const seen: unknown[] = [];
  const spy = jest.spyOn(F6ToolSession.prototype, 'invoke').mockImplementation(function(this: F6ToolSession, name, args) {
    seen.push(JSON.parse(this.resources['facts.md']));
    return invoke.call(this, name, args);
  });
  try {
    const output = JSON.stringify({type: 'native_tool_calls', content: '', tool_calls: [{id: 'save', type: 'function',
      function: {name: 'write_output', arguments: JSON.stringify({resume_markdown: resume, purpose: '交稿'})}}]});
    await runF6ResumeWriter({...input, contextTools}, async () => output, () => {});
    expect(seen[0]).toEqual([extra]);
  } finally { spy.mockRestore(); }
});
test('only three output fields remain; notes alone cannot stand in for a draft', async () => {
  const contextTools = new F6ContextTools(reader);
  const session = new F6ToolSession({...input, contextTools}, () => [], undefined, undefined, undefined, true);
  const write = session.availableTools().find(t => t.function.name === 'write_output')!.function;
  expect(Object.keys(write.parameters.properties as object).sort())
    .toEqual(['mentor_markdown', 'notes_markdown', 'purpose', 'resume_markdown']);
  await expect(session.invoke('write_output', {notes_markdown: '只更新说明'})).rejects.toThrow('OUTPUT_RESUME_REQUIRED');
  expect(session.outputs.size).toBe(0);
  await session.invoke('write_output', {resume_markdown: resume, notes_markdown: '保留已有事实'});
  expect(session.outputs.get('resume-new.md')).toBe(resume);
});
test('teaching cases use one directory; private original cards are not published through it', async () => {
  const contextTools = new F6ContextTools(reader);
  const catalogue = await contextTools.invoke('knowledge_search', {query: ''});
  expect(JSON.stringify(catalogue)).toContain('teaching.context-cost.v1');
  expect(JSON.stringify(catalogue)).not.toContain('S002');
  const result = await contextTools.invoke('knowledge_read', {ids: ['teaching.context-cost.v1', 'S002']});
  expect(result.documents).toHaveLength(1);
  expect(result.unavailableIds).toEqual(['S002']);
  const session = new F6ToolSession({...input, contextTools}, () => []);
  await expect(session.invoke('read_file', {file: 'S002'})).rejects.toThrow('READ_OUTSIDE_SCOPE');
  await expect(session.invoke('read_file', {file: 'facts.md'})).rejects.toThrow('READ_OUTSIDE_SCOPE');
});
test('both author and HR select official Flash explicitly; wrong served model fails rather than falling back', () => {
  for (const model of ['deepseek-v4-pro', undefined]) {
    expect(f6OfficialLlmOptions({model, temperature: 0})).toMatchObject({
      provider: 'deepseek', model: 'deepseek-flash', siteFunded: true,
      exactSiteF6Model: 'deepseek-flash', maxRetries: 0, temperature: 0,
    });
  }
  expect(() => assertF6OfficialServedModel('deepseek-flash')).not.toThrow();
  expect(() => assertF6OfficialServedModel('step-3.7-flash')).toThrow('F6_SERVED_MODEL_MISMATCH');
});
