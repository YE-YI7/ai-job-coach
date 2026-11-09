import {F6ToolSession, F6_ORIGIN_TOOLS} from './f6-tool-session';
import origin from './f6-origin.json';
import {f6InitialMessages, runF6ResumeWriter} from './resume-f6-writer';
import {withEvalObserver} from './eval-scope';
import type {F6Checkpoint} from './resume-f6-writer';

const input = {resume: '已有工作：排查指令传递失败并修复。', jd: 'Manus Agent 产品经理',
  facts: [{id: 'own', text: '排查指令传递失败并修复。'}], answers: [], decisions: [], request: '',
  scope: 'whole' as const, format: {}, company: 'Manus', domain: 'manus.im'};
const services = () => ({search: jest.fn().mockResolvedValue({results: [{url: 'https://manus.im/a'}]}),
  fetch: jest.fn().mockResolvedValue({pages: [{url: 'https://manus.im/a', text: 'public page'}]}),
  render: jest.fn().mockResolvedValue({bytes: new Uint8Array([1, 2, 3]),
    receipt: {pages: 1, lastPageFill: 0.8, font: 8.5, margin: 10, actualPageSize: 'A4', textLayer: true}})});
const calls = (items: Array<[string, unknown]>) => JSON.stringify({type: 'native_tool_calls',
  tool_calls: items.map(([name, args], i) => ({id: 't' + i, type: 'function',
    function: {name, arguments: JSON.stringify(args)}}))});

test('all five tools and all ten read IDs have origin-frozen schemas, not a new two-tool adapter', () => {
  expect(F6_ORIGIN_TOOLS).toEqual(origin.tools);
  expect(F6_ORIGIN_TOOLS.map(t => t.function.name)).toEqual(['read_file', 'search', 'fetch', 'write_output', 'render_pdf']);
  const properties = F6_ORIGIN_TOOLS[0].function.parameters.properties as {file: {enum: string[]}};
  expect(properties.file.enum).toHaveLength(10);
  expect(Object.keys(new F6ToolSession(input, () => []).resources).sort()).toEqual([...properties.file.enum].sort());
});

test('original, JD, facts and every teaching case can actually be read; case text is byte-preserved', async () => {
  const session = new F6ToolSession(input, () => []);
  for (const id of Object.keys(session.resources)) {
    expect(await session.invoke('read_file', {file: id})).toEqual({file: id, text: session.resources[id]});
  }
  expect(session.resources['resume.md']).toBe(input.resume);
  expect(JSON.parse(session.resources['facts.md'])).toEqual(input.facts);
  await expect(session.invoke('read_file', {file: '../another-user'})).rejects.toThrow('READ_OUTSIDE_SCOPE');
});

test('search and fetch receive only their explicit public arguments; tool failures are not fabricated success', async () => {
  const publicServices = services(), session = new F6ToolSession(input, () => [], publicServices);
  await session.invoke('search', {topic: 'role'}); await session.invoke('fetch', {urls: ['https://manus.im/a']});
  expect(publicServices.search).toHaveBeenCalledWith('role');
  expect(publicServices.fetch).toHaveBeenCalledWith(['https://manus.im/a']);
  expect(JSON.stringify(publicServices.search.mock.calls)).not.toContain(input.resume);
});

test('all five output artifacts survive; PDF requires a saved draft and reports a real renderer receipt', async () => {
  const hooks = services(), session = new F6ToolSession(input, () => [], hooks);
  await expect(session.invoke('render_pdf', {})).rejects.toThrow('NO_SAVED_RESUME_TO_RENDER');
  const names = ['portrait.md', 'battle.md', 'resume-new.md', 'changes.md', 'notes.md'];
  expect(await session.invoke('write_output', {files: names
    .map(name => ({name, text: name === 'resume-new.md' ? input.resume : name + ' output'}))}))
    .toEqual({saved: names, resumeRevision: 1});
  expect(await session.invoke('render_pdf', {}))
    .toEqual({pages: 1, lastPageFillEstimate: 0.8, font: 8.5, margin: 10, revision: 1});
  expect(hooks.render).toHaveBeenCalledWith(input.resume);
  expect(Object.keys(session.deliverables().files)).toHaveLength(5);
  expect(session.deliverables().pdf?.current).toBe(true);
  expect(session.deliverables().pdf?.receipt).toMatchObject({actualPageSize: 'A4', textLayer: true});
  await session.invoke('write_output', {files: [{name: 'resume-new.md', text: input.resume + ' 后续'}]});
  expect(session.deliverables().pdf?.current).toBe(false);
});

test('no replacement third system message or compulsory tool sequence; rejected facts return to the same author', async () => {
  expect(f6InitialMessages(input).map(m => m.role)).toEqual(['system', 'user']);
  expect(f6InitialMessages(input)[0].content).not.toContain('当前未提供公开搜索');
  const hooks = services(), spans: never[] = [];
  const run = jest.fn().mockResolvedValueOnce(calls([['read_file', {file: 'S002'}], ['search', {topic: 'role'}]]))
    .mockResolvedValueOnce(calls([['write_output', {files: [{name: 'resume-new.md', text: 'bad fact'}]}]]))
    .mockResolvedValueOnce(calls([['write_output', {files: [{name: 'resume-new.md', text: input.resume},
      {name: 'notes.md', text: '选已核实的排查与修复，舍弃无依据的效果。'}]}], ['render_pdf', {}]]));
  const result = JSON.parse(await withEvalObserver({spans, save: async () => {}}, () =>
    runF6ResumeWriter(input, run, jest.fn(), text => text === 'bad fact' ? ['unverified'] : [], hooks)));
  expect(result.fullDocument).toBe(input.resume);
  expect(result.f6Deliverables.pdf.current).toBe(true);
  expect(JSON.stringify(run.mock.calls[2][0])).toContain('unverified');
  expect(JSON.stringify(spans)).toContain('f6_tool_search');
  expect(JSON.stringify(spans)).toContain('f6_tool_render_pdf');
  expect(run.mock.calls[0][3]).toEqual(origin.tools);
});

test('production cannot silently fall back to the old per-suggestion author interface', async()=>{
  const run=jest.fn().mockResolvedValue(JSON.stringify({changes:[{before:input.resume,after:'only typos'}]}));
  await expect(runF6ResumeWriter(input,run,jest.fn())).rejects.toThrow('F6_WRITER_PROTOCOL_INVALID');
  expect(run).toHaveBeenCalledTimes(1);
});
test('continue the same author after a checkpoint without replaying paid calls or rereading tools',async()=>{
  const checkpoint:F6Checkpoint={messages:[...f6InitialMessages(input),{role:'assistant',content:'',tool_calls:[]},
    {role:'tool',tool_call_id:'old',content:'actual old receipt'}],readIds:['spec.md'],completedAuthorCalls:3,publicCalls:[]};
  const run=jest.fn().mockResolvedValue(input.resume+'\n'),read=jest.fn(),hooks=services();
  const result=JSON.parse(await runF6ResumeWriter(input,run,read,()=>[],hooks,checkpoint));
  expect(run).toHaveBeenCalledTimes(1);expect(run.mock.calls[0][0]).toEqual(checkpoint.messages);
  expect(read).not.toHaveBeenCalled();expect(hooks.search).not.toHaveBeenCalled();expect(hooks.fetch).not.toHaveBeenCalled();
  expect(result.fullDocument).toBe(input.resume+'\n');
  expect(result.f6Deliverables.files['resume-new.md']).toBe(input.resume+'\n');
  await expect(runF6ResumeWriter({...input,resume:'changed'},run,read,()=>[],hooks,checkpoint)).rejects.toThrow('F6_CHECKPOINT_INPUT_CHANGED');
});
