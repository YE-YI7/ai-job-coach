import { f6MetricDirectionIssues, runF6ResumeWriter } from './resume-f6-writer';

const input={resume:'原稿',jd:'',facts:[{id:'fact',text:'候选人事实'}],request:'',answers:[],decisions:[],scope:'whole' as const,format:{}};
const draft='{"changes":[]}';

test('agent sees the catalogue, then receives only the actual requested resources',async()=>{
  const run=jest.fn().mockResolvedValueOnce('{"read_file":["S007"]}').mockResolvedValueOnce(draft);
  const receipt=jest.fn();
  expect(await runF6ResumeWriter(input,run,receipt)).toBe(draft);
  expect(receipt).toHaveBeenCalledWith(['S007']);
  expect(run.mock.calls.map((call)=>call[1])).toEqual(['read_or_write','write']);
  const first=JSON.stringify(run.mock.calls[0][0]),second=JSON.stringify(run.mock.calls[1][0]);
  expect(first).toContain('S006');
  expect(first).toMatch(/JSON/);
  expect(first).not.toContain('弱稿');
  expect(second).toContain('将每次全量注入改为按需加载');
  expect(second).not.toContain('用补丁评测识别失败');
});

test('does not force a case read or another author turn',async()=>{
  const run=jest.fn().mockResolvedValue(draft);
  expect(await runF6ResumeWriter(input,run,jest.fn())).toBe(draft);
  expect(run).toHaveBeenCalledTimes(1);
});

test.each([
  '{"read_file":["../private"]}',
  '{"read_file":["S007","S007"]}',
  '{"read_file":["S006","S007","spec.md"]}',
  '{"read_file":["S007"],"changes":[]}',
])('invalid or mixed tool requests do not fetch or invoke a second model: %s',async(payload)=>{
  const run=jest.fn().mockResolvedValue(payload);
  const receipt=jest.fn();
  await expect(runF6ResumeWriter(input,run,receipt)).rejects.toThrow('F6_READ_OUTSIDE_CATALOGUE');
  expect(run).toHaveBeenCalledTimes(1);
  expect(receipt).not.toHaveBeenCalled();
});

test('rejects another read after delivery turn begins',async()=>{
  const run=jest.fn().mockResolvedValue('{"read_file":["S006"]}');
  await expect(runF6ResumeWriter(input,run,jest.fn())).rejects.toThrow('F6_READ_BUDGET_EXHAUSTED');
  expect(run).toHaveBeenCalledTimes(2);
});

test('host translates a write receipt to the original exact anchor, not model text',async()=>{
  const resume='## 项目经历\n对照向量和关键词检索，定位专业术语排序问题。\n重复段落重复段落\n重复段落重复段落';
  const entry={id:'p2',after:'对比向量和关键词检索，定位专业术语排序偏差。',sourceIds:['p2']};
  const call=jest.fn().mockResolvedValue(JSON.stringify({write_output:[entry],selectionReceipt:'保留对照依据'}));
  const facts=[{id:'resume-line-2',text:'对照向量和关键词检索，定位专业术语排序问题。'}];
  const output=JSON.parse(await runF6ResumeWriter({...input,resume,facts},call,jest.fn()));
  expect(output.changes).toEqual([{before:'对照向量和关键词检索，定位专业术语排序问题。',after:entry.after,sourceIds:['resume-line-2']}]);
  expect(output.selectionReceipt).toBe('保留对照依据');
  for(const id of ['p1','p3','p4','p99']){
    call.mockResolvedValue(JSON.stringify({write_output:[{...entry,id}]}));
    await expect(runF6ResumeWriter({...input,resume},call,jest.fn())).rejects.toThrow('F6_WRITE_OUTSIDE_SCOPE');
  }
});

test('keeps measured delta separate from current level',()=>{
  const before='专业术语命中率提升30百分点，问答正确率提升6.4个百分点';
  expect(f6MetricDirectionIssues(before,'术语命中率提高30个百分点，问答正确率6.4百分点')).toHaveLength(1);
  expect(f6MetricDirectionIssues(before,'术语命中率提高30个百分点，问答正确率下降6.4个百分点')).toHaveLength(1);
  expect(f6MetricDirectionIssues(before,'术语命中率提高30个百分点，问答正确率提高6.4个百分点')).toEqual([]);
  expect(f6MetricDirectionIssues(before,'问答正确率 +6.4pp')).toEqual([]);
  expect(f6MetricDirectionIssues('误判率降低20%','误判率20%')).toHaveLength(1);
});
