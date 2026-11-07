import { f6MetricDirectionIssues, runF6ResumeWriter, F6_MAX_AUTHOR_CALLS } from './resume-f6-writer';
import accepted from './f6-accepted.json';

const input = {resume:'原稿段落：负责模型评测并整理失败原因。',jd:'',facts:[{id:'fact',text:'原稿段落：负责模型评测并整理失败原因。'}],
  request:'',answers:[],decisions:[],scope:'whole' as const,format:{}};
const tool = (name: string, args: unknown) => JSON.stringify({type:'native_tool_calls',content:'',
  tool_calls:[{id:'call-'+name,type:'function',function:{name,arguments:JSON.stringify(args)}}]});

test('accepted F6 map and COMPLETE teaching cards are used, not replacement summaries', async () => {
  const run = jest.fn().mockResolvedValueOnce(tool('read_file',{file:'S007'}))
    .mockResolvedValueOnce(tool('write_output',{files:[{name:'resume-new.md',text:'原稿段落：整理模型评测中的失败原因。'},{name:'notes.md',text:'优先呈现具体评测交付'}]}));
  const receipt = jest.fn();
  const result = JSON.parse(await runF6ResumeWriter(input,run,receipt));
  expect(receipt).toHaveBeenCalledWith(['S007']);
  expect(run.mock.calls[0][0][0].content).toContain('规格地图（v1.3');
  expect(JSON.stringify(run.mock.calls[0][0])).not.toContain('段落 id');
  expect(JSON.stringify(run.mock.calls[0][0])).not.toContain('最多给出 6');
  expect(run.mock.calls[1][0].some((m:{role:string;content:string})=>m.role==='tool'&&JSON.parse(m.content).text===accepted.resources.S007)).toBe(true);
  expect(result.fullDocument).toBe('原稿段落：整理模型评测中的失败原因。');
  expect(result.selectionReceipt).toBe('优先呈现具体评测交付');
  expect(result.changes[0].before).toBe(input.resume);
});

test('no compulsory planning call: author can deliver the complete document immediately', async () => {
  const run = jest.fn().mockResolvedValue('原稿段落：整理模型评测中的失败原因。');
  const result = JSON.parse(await runF6ResumeWriter(input,run,jest.fn()));
  expect(result.changes).toHaveLength(1);
  expect(run).toHaveBeenCalledTimes(1);
  expect(run.mock.calls[0][3].map((t:{function:{name:string}})=>t.function.name)).toEqual(['read_file','write_output']);
});

test('author can read both cases in independent turns, then deliver without a six-suggestion constraint', async () => {
  const run = jest.fn().mockResolvedValueOnce(tool('read_file',{file:'S006'}))
    .mockResolvedValueOnce(tool('read_file',{file:'S007'})).mockResolvedValueOnce(input.resume);
  const receipt = jest.fn();
  const result = JSON.parse(await runF6ResumeWriter(input,run,receipt));
  expect(result.status).toBe('unchanged');
  expect(receipt.mock.calls).toEqual([[['S006']],[['S007']]]);
  expect(run).toHaveBeenCalledTimes(3);
});

test.each([
  tool('read_file',{file:'../private'}),
  tool('write_output',{files:[{name:'outside.md',text:'x'}]}),
  tool('write_output',{files:[{name:'resume-new.md',text:''}]}),
  '{"bad":"protocol"}',
])('scope/protocol errors do not invoke another model: %s', async payload => {
  const run=jest.fn().mockResolvedValue(payload);
  await expect(runF6ResumeWriter(input,run,jest.fn())).rejects.toThrow();
  expect(run).toHaveBeenCalledTimes(1);
});

test('bounded autonomous reading cannot create an infinite billable loop', async () => {
  const run=jest.fn().mockResolvedValue(tool('read_file',{file:'spec.md'}));
  await expect(runF6ResumeWriter(input,run,jest.fn())).rejects.toThrow('F6_AUTHOR_CALL_BUDGET_EXHAUSTED');
  expect(run).toHaveBeenCalledTimes(F6_MAX_AUTHOR_CALLS);
});

test('keeps measured delta separate from current level', () => {
  const before='专业术语命中率提升30百分点，问答正确率提升6.4个百分点';
  expect(f6MetricDirectionIssues(before,'术语命中率提高30个百分点，问答正确率6.4百分点')).toHaveLength(1);
  expect(f6MetricDirectionIssues(before,'术语命中率提高30个百分点，问答正确率下降6.4个百分点')).toHaveLength(1);
  expect(f6MetricDirectionIssues(before,'术语命中率提高30个百分点，问答正确率提高6.4个百分点')).toEqual([]);
});
