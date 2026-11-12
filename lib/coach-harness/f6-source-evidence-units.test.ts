import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {f6ReviewHints} from './f6-review-hints';
import {f6ReviewReferences} from './f6-review-references';
import {f6HrMessages,F6_HR_PROMPT} from './f6-hr-review';

const source='陈宁\n\n教育经历\n南河大学｜信息管理本科｜2019—2023\n\n工作经历\n与1名算法、2名后端协作。';
test('unpaired source section is exact review data, not a deletion verdict or automatic edit',()=>{
  const candidate='陈宁\n\n工作经历\n3人产品/算法/后端团队。';
  const full=f6ReviewHints(source,candidate,[{id:'source',text:source}]);
  const wire=f6ReviewReferences(source,candidate,full);
  expect(wire.sourceStructureToReconcile.sourceSectionsWithoutRecognizedCounterpart).toEqual([
    {kind:'education',heading:'教育经历',sourceLines:['南河大学｜信息管理本科｜2019—2023']},
  ]);
  for(const item of wire.passages){
    expect(item).not.toHaveProperty('notices');
  }
  expect(full.passages.some(item=>item.before.includes('1名算法')&&item.after.includes('3人'))).toBe(true);
  expect(wire).not.toHaveProperty('noticeEvidence');
  expect(wire).not.toHaveProperty('verdict');expect(wire).not.toHaveProperty('passed');
});
test('removing only a heading while retaining qualification content is not reported as an unmatched source section',()=>{
  const candidate=source.replace('教育经历\n','');
  const wire=f6ReviewReferences(source,candidate,f6ReviewHints(source,candidate,[]));
  expect(wire.sourceStructureToReconcile.sourceSectionsWithoutRecognizedCounterpart).toEqual([]);
});
test('equivalent paraphrase remains for human/model reconciliation, never rejected by lexical difference',()=>{
  const candidate=source.replace('教育经历\n','').replace('信息管理本科','信息管理（学士）');
  const wire=f6ReviewReferences(source,candidate,f6ReviewHints(source,candidate,[]));
  expect(wire.sourceStructureToReconcile.meaning).toContain('不是判错');
  expect(wire.sourceStructureToReconcile.sourceSectionsWithoutRecognizedCounterpart[0].sourceLines[0]).toContain('本科');
  expect(wire).not.toHaveProperty('rejected');
});
const root=process.env.F6_COVERAGE_REPLAY;
(root?test:test.skip)('real failed reviewer receives exact labeled source units, same HR prompt and same candidate bytes',()=>{
  const task=JSON.parse(readFileSync(path.join(root!,'attempt-6-task-initial.json'),'utf8')).task;
  const row=JSON.parse(readFileSync(path.join(root!,'attempt-6-coach_eval_runs-initial.json'),'utf8'))
    .find((item:{id:string})=>item.id===task.delivery.evalRunId);
  const hr=row.run.spans.find((item:{kind:string;name:string})=>item.kind==='agent'&&item.name==='独立质检 Agent');
  const oldMessages=hr.input.messages;
  const text=(index:number)=>oldMessages[index].content.split('\n\n').slice(1).join('\n\n');
  const original=text(2),body=text(oldMessages.length-1);
  const hints=f6ReviewHints(original,body,[{id:'source',text:original}]);
  const context=JSON.parse(oldMessages[1].content).mechanical_review_hints;
  const wire=f6ReviewReferences(original,body,hints);
  const messages=f6HrMessages({resume:original,facts:text(3),jd:text(4)},body,{...context,hints:wire});
  expect(messages[0].content).toBe(oldMessages[0].content);expect(messages[0].content).toBe(F6_HR_PROMPT);
  expect(messages.at(-1)!.content).toBe(oldMessages.at(-1).content);
  expect(wire.sourceStructureToReconcile.sourceSectionsWithoutRecognizedCounterpart)
    .toContainEqual({kind:'education',heading:'教育经历',sourceLines:['江南理工大学（虚构院校）｜信息管理本科｜2019.09—2023.06']});
  expect(hints.passages.some(part=>part.before.includes('一名算法和两名后端')&&part.after.includes('3 人'))).toBe(true);
  expect(wire).not.toHaveProperty('noticeEvidence');
  writeFileSync(path.join(root!,'v22-source-units-replay.json'),JSON.stringify({
    upstreamCalls:0,costCny:0,kind:'source_evidence_transport_replay_not_quality',sourceEval:task.delivery.evalRunId,
    sourceTrace:task.delivery.traceId,samePrompt:true,sameSourceAndCandidate:true,sourceUnitEvidence:wire,
    badHrOutputPreserved:hr.output,semanticQualityRetested:false},null,2));
});
