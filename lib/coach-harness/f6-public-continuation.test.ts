import {F6PublicTools} from './f6-public-tools';
import {F6ToolSession, F6_ORIGIN_TOOLS} from './f6-tool-session';
import {F6HrReviewSession} from './f6-hr-review';
import {f6InitialMessages, runF6ResumeWriter} from './resume-f6-writer';
import {withEvalObserver} from './eval-scope';

const input = {resume: '参与评测，整理120条用例。', jd: 'Manus 评测岗位', facts: [],
  request: '', answers: [], decisions: [], scope: 'whole' as const, format: {}, company: 'Manus'};
const tool = (entries: Array<[string, unknown]>) => JSON.stringify({type: 'native_tool_calls',
  tool_calls: entries.map(([name, args], i) => ({id: 'call-' + i, type: 'function',
    function: {name, arguments: JSON.stringify(args)}}))});
const write = (text: string) => tool([['write_output', {files: [{name: 'resume-new.md', text}]}]]);
const search = ['search', {topic: 'role'}] as [string, unknown];
const fetchPage = ['fetch', {urls: ['https://manus.im/docs']}] as [string, unknown];
function services() {
  const network = jest.fn(async () => new Response(JSON.stringify({result: {content: [{type: 'text',
    text: 'Title: Manus\nURL: https://manus.im/docs\nSource text'}]}})));
  const research = new F6PublicTools('Manus', 'manus.im', network);
  return {network, research, hooks: {search: (topic: unknown) => research.search(topic),
    fetch: (urls: unknown) => research.read(urls), publicBudget: () => research.budget(),
    render: jest.fn().mockResolvedValue({bytes: new Uint8Array([1]), receipt: {pages: 1}})}};
}

test('four shared requests: last success retains evidence and announces both tools unavailable before another author turn', async () => {
  const {hooks, network} = services(), session = new F6ToolSession(input, () => [], hooks);
  expect(session.availableTools()).toEqual(F6_ORIGIN_TOOLS);
  await session.invoke('search', {topic: 'role'});
  await session.invoke('fetch', {urls: ['https://manus.im/docs']});
  await session.invoke('search', {topic: 'screening'});
  const last = await session.invoke('fetch', {urls: ['https://manus.im/docs']});
  expect(last).toMatchObject({pages: [{text: expect.stringContaining('Source text')}], publicResearch: {
    status: 'exhausted', retryable: false, budget: {used: 4, limit: 4, remaining: 0},
    unavailableTools: ['search', 'fetch'], availableTools: ['read_file', 'write_output', 'render_pdf'],
  }});
  for (const name of ['search', 'fetch']) {
    await expect(session.invoke(name, {})).rejects.toThrow('PUBLIC_REQUEST_BUDGET');
  }
  expect(network).toHaveBeenCalledTimes(4);
  expect(session.availableTools()).toEqual(F6_ORIGIN_TOOLS.filter(t => !['search', 'fetch'].includes(t.function.name)));
  expect(await session.invoke('read_file', {file: 'resume.md'})).toEqual({file: 'resume.md', text: input.resume});
});

test('failure at the fourth request also removes both tools; no extra request, retry or paid fallback', async () => {
  const {hooks, network} = services(), session = new F6ToolSession(input, () => [], hooks);
  for (let i = 0; i < 3; i++) await session.invoke('search', {topic: 'role'});
  network.mockRejectedValueOnce(Error('PUBLIC_SEARCH_UNAVAILABLE_NO_PAID_FALLBACK'));
  const error = await session.invoke('search', {topic: 'team'}).catch(e => session.errorReceipt(e));
  expect(error).toMatchObject({error: 'PUBLIC_SEARCH_UNAVAILABLE_NO_PAID_FALLBACK',
    publicResearch: {status: 'exhausted', retryable: false}});
  expect(session.availableTools().map(t => t.function.name)).not.toContain('search');
  expect(network).toHaveBeenCalledTimes(4);
});

test('restored exhausted checkpoint and legacy budget errors expose the same terminal capability state', async () => {
  const checkpoint = Array.from({length: 4}, () => ({name: 'search', output: {results: []}}));
  const restored = new F6ToolSession(input, () => [], undefined, checkpoint);
  expect(restored.availableTools().map(t => t.function.name)).toEqual(['read_file', 'write_output', 'render_pdf']);
  const legacy = new F6ToolSession(input, () => [], {...services().hooks, publicBudget: undefined});
  expect(legacy.errorReceipt(Error('PUBLIC_REQUEST_BUDGET'))).toMatchObject({
    error: 'PUBLIC_REQUEST_BUDGET', publicResearch: {retryable: false, unavailableTools: ['search', 'fetch']},
  });
  expect(legacy.availableTools().map(t => t.function.name)).not.toContain('fetch');
});

test('same-batch stale search gets terminal receipt; author still chooses reading, writing and HR response inside unchanged limit', async () => {
  const {hooks, network} = services();
  const hr = jest.fn().mockResolvedValue('请核实“主导”，原文是“参与”。');
  const spans: never[] = [];
  const author = jest.fn()
    .mockResolvedValueOnce(tool([search]))
    .mockResolvedValueOnce(tool([fetchPage, search]))
    .mockResolvedValueOnce(tool([fetchPage, search]))
    .mockResolvedValueOnce(tool([['read_file', {file: 'S007'}]]))
    .mockResolvedValueOnce(write('主导评测，整理120条用例。'))
    .mockResolvedValueOnce(tool([['read_file', {file: 'resume.md'}]]))
    .mockResolvedValueOnce(tool([['write_output', {files: [{name: 'resume-new.md', text: input.resume}]}], ['render_pdf', {}]]));
  const review = new F6HrReviewSession({resume: input.resume, jd: input.jd, facts: '[]'}, hr);
  const result = JSON.parse(await withEvalObserver({spans, save: async () => {}}, () =>
    runF6ResumeWriter(input, author, () => {}, undefined, hooks, undefined, review)));
  expect(network).toHaveBeenCalledTimes(4);
  expect(author).toHaveBeenCalledTimes(7);
  expect(hr).toHaveBeenCalledTimes(1);
  for (const invocation of author.mock.calls.slice(3)) {
    expect(invocation[3].map((t: {function: {name: string}}) => t.function.name))
      .toEqual(['read_file', 'write_output', 'render_pdf']);
    expect(invocation[0].slice(0, 2)).toEqual(f6InitialMessages(input));
    expect(JSON.stringify(invocation[0])).toContain('Source text');
  }
  expect(JSON.parse(author.mock.calls[3][0].at(-1).content)).toMatchObject({
    error: 'PUBLIC_REQUEST_BUDGET', publicResearch: {retryable: false},
  });
  expect(result.fullDocument).toBe(input.resume);
  expect(result.hrReview.finalState).toBe('author_revised_not_rechecked');
  expect(result.f6Deliverables.pdf.current).toBe(true);
  expect(JSON.stringify(spans)).toContain('"publicResearch"');
});

test('author can deliver without public research: no mandatory search or fixed next step', async () => {
  const {hooks, network} = services(), author = jest.fn().mockResolvedValue(write(input.resume));
  const result = JSON.parse(await runF6ResumeWriter(input, author, () => {}, undefined, hooks));
  expect(result.fullDocument).toBe(input.resume);
  expect(author).toHaveBeenCalledTimes(1);
  expect(network).not.toHaveBeenCalled();
});
