import {f6InitialMessages, runF6ResumeWriter} from './resume-f6-writer';
import {F6ToolSession, F6_ORIGIN_TOOLS} from './f6-tool-session';
import origin from './f6-origin.json';

const input={resume:'候选人完整原文\n',jd:'虚构岗位\n',facts:[{id:'a',text:'已确认补充'}],
  request:'',answers:[],decisions:[],scope:'whole' as const,format:{}};
const fixture={system:f6InitialMessages(input)[0].content,spec:origin.resources['spec.md'],
  facts:'# 本人补充\n已确认补充\n',task:'本次改整份授权简历，按已有方向优化。'};

test('bench uses ordinary whole-document H0 system and byte-preserved author files, without invented history',()=>{
  const messages=f6InitialMessages({...input,fixture});
  expect(messages.map(m=>m.role)).toEqual(['system','user']);
  expect(messages[0]).toEqual(f6InitialMessages(input)[0]);
  const user=JSON.parse(messages[1].content);
  expect(user['resume.md']).toBe(input.resume);expect(user['jd.txt']).toBe(input.jd);
  expect(user['facts.md']).toBe(fixture.facts);
  for(const key of ['editingRequest','priorDecisions','answers','checks.md'])expect(user).not.toHaveProperty(key);
});
test('review-only checks are not a tool resource; detailed spec can differ without changing executors',async()=>{
  const session=new F6ToolSession({...input,facts:fixture.facts},()=>[],undefined,undefined,'candidate policy');
  expect(session.resources['facts.md']).toBe(fixture.facts);
  expect(await session.invoke('read_file',{file:'spec.md'})).toEqual({file:'spec.md',text:'candidate policy'});
  await expect(session.invoke('read_file',{file:'checks.md'})).rejects.toThrow('READ_OUTSIDE_SCOPE');
  expect(Object.keys(session.resources).sort()).toEqual(Object.keys(new F6ToolSession(input,()=>[]).resources).sort());
  expect(F6_ORIGIN_TOOLS).toEqual(origin.tools);
});
test('fixture is not allowed to silently mix in a historical editing request',()=>{
  for(const changed of [{request:'旧要求'},{answers:[{answer:'旧回答'}]},{decisions:['旧决定']}]){
    expect(()=>f6InitialMessages({...input,...changed,fixture})).toThrow('F6_FIXTURE_HAS_HISTORY');
  }
});
test('fixture still runs the same autonomous writer and verifier, not a replacement text generator',async()=>{
  const call=jest.fn().mockResolvedValueOnce('有事实问题的正文').mockResolvedValueOnce('核实后修订的正文');
  const verify=jest.fn((body:string)=>body==='有事实问题的正文'?['需要回原材料核实']:[]);
  const result=JSON.parse(await runF6ResumeWriter({...input,fixture},call,jest.fn(),verify));
  expect(call).toHaveBeenCalledTimes(2);expect(call.mock.calls[0][3]).toEqual(origin.tools);
  expect(call.mock.calls[1][0][0]).toEqual({role:'system',content:fixture.system});
  expect(JSON.stringify(call.mock.calls[1][0])).toContain('需要回原材料核实');
  expect(result.fullDocument).toBe('核实后修订的正文');
  expect(result.changes.every((c:{sourceIds:string[]})=>c.sourceIds.includes('a'))).toBe(true);
});
