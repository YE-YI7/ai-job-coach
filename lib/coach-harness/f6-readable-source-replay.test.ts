import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {f6HrMessages} from './f6-hr-review';

test('source documents are readable, exact and present once; metadata never becomes candidate facts', () => {
  const input={resume:'许晴\n教育经历\n甲大学｜信息管理本科\n\n工作经历\n乙公司',jd:'产品经理',facts:'[{"text":"本人负责验收"}]'};
  const candidate='许晴\n工作经历\n乙公司';
  const messages=f6HrMessages(input,candidate);
  const metadata=JSON.parse(messages[1].content);
  for(const [document,text] of Object.entries({'resume.md':input.resume,'facts.md':input.facts,'jd.txt':input.jd})) {
    const sources=messages.filter(message=>message.content.startsWith('核源文档 '+document+'（不是新稿）\n\n'));
    expect(sources).toHaveLength(1);
    expect(sources[0].content.split('\n\n').slice(1).join('\n\n')).toBe(text);
    expect(metadata.sources[document]).toEqual({providedAsReadableMessage:true,
      sha256:createHash('sha256').update(text).digest('hex')});
  }
  expect(messages.at(-1)!.content.endsWith(candidate)).toBe(true);
});

const root=process.env.F6_COVERAGE_REPLAY;
(root?test:test.skip)('actual v18 missed qualification replays with native source boundaries, no changed facts or outputs',()=>{
  const task=JSON.parse(readFileSync(path.join(root!,'attempt-5-task-initial.json'),'utf8')).task;
  const row=JSON.parse(readFileSync(path.join(root!,'attempt-5-coach_eval_runs-initial.json'),'utf8'))
    .find((item:{id:string})=>item.id===task.delivery.evalRunId);
  const hr=row.run.spans.find((span:{kind:string;name:string})=>span.kind==='agent'&&span.name==='独立质检 Agent');
  const old=hr.input.messages;
  const sources=JSON.parse(old[1].content).sources;
  const candidate=old.at(-1).content;
  const body=candidate.slice(candidate.indexOf('\n\n')+2);
  const input={resume:sources['resume.md'],facts:sources['facts.md'],jd:sources['jd.txt']};
  const messages=f6HrMessages(input,body,JSON.parse(old[1].content).mechanical_review_hints);
  expect(messages[0].content).toBe(old[0].content);
  expect(messages.at(-1)!.content).toBe(candidate);
  expect(messages[2].content).toContain('江南理工大学（虚构院校）｜信息管理本科｜2019.09—2023.06');
  expect(task.result.f6Deliverables.files['resume-new.md']).not.toContain('信息管理本科');
  writeFileSync(path.join(root!,'attempt-5-readable-sources-replay.json'),JSON.stringify({
    kind:'recorded_input_representation_replay_not_model_quality',upstreamCalls:0,costCny:0,
    sourceEval:task.delivery.evalRunId,sourceTrace:task.delivery.traceId,
    hrPromptUnchanged:true,candidateBytePreserved:true,sourceDocumentsBytePreserved:true,
    originalHrOutput:hr.output,readableMessages:messages,semanticQualityRetested:false,
  },null,2));
});
