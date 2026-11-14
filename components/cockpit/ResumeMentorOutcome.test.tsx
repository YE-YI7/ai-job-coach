import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ResumeMentorOutcome from './ResumeMentorOutcome';
import {tutorReportSections} from './TutorReport';
import type {ResumeAgentTask} from '@/lib/coach-harness/resume-task-types';
jest.mock('./TutorMarkdown',()=>({__esModule:true,default:({children}:{children:string})=><div>{children}</div>}));
const report='独立 HR 点评（针对首稿，供核对，不是审核通过）\n未再复审。\n\n### 先核实这处\n原材料没有确认主导，请核实。\n\n### 面试怎么问\n你本人承担了哪一部分？';
const result:ResumeAgentTask['result']={changes:[],summary:'本轮生成了建议。\n'+report,
  applicationQuality:{artifactId:'fixture',version:1,status:'draft',reviews:[{reviewerType:'independent_ai',status:'warning',summary:report}]}};
test('user delivery never renders internal summary or HR commentary, while retaining the saved result',()=>{
  const before=JSON.stringify(result);
  const html=renderToStaticMarkup(<ResumeMentorOutcome result={result} pendingCount={1}/>);
  expect(html).toContain('新稿已保存');
  expect(html).not.toContain('查看本轮修改说明');expect(html).not.toContain('HR');
  expect(html).not.toContain('原材料没有确认主导');
  expect(html).not.toContain('本轮生成了建议');
  expect(JSON.stringify(result)).toBe(before);
});
test('accepted status is preserved without exposing historical internal summaries',()=>{
  const html=renderToStaticMarkup(<ResumeMentorOutcome result={result} pendingCount={0}/>);
  expect(html).toContain('修改已处理');expect(html).not.toContain('等待你确认');
  const old={changes:[],summary:'老记录原话，保留在后台，不展示给求职者。'};
  expect(renderToStaticMarkup(<ResumeMentorOutcome result={old}/>)).not.toContain(old.summary);
  expect(old.summary).toBe('老记录原话，保留在后台，不展示给求职者。');
});
test('headings inside fenced code do not become report topics; original text is recoverable exactly',()=>{
  const raw=report+'\n```text\n### 不是真标题\n```\n';
  const {introduction,sections}=tutorReportSections(raw);
  expect(sections.map(s=>s.title)).toEqual(['先核实这处','面试怎么问']);
  expect(introduction+sections.map(s=>s.body).join('')).toBe(raw);
});

test('current author coaching stays visible with no HR or internal change-log disclosures',()=>{
  const coaching = '这句可以体现**交付推进**。先回忆一次上线卡点，你实际协调了哪一项？';
  const coached = {...result, f6Deliverables: {files: {'changes.md': coaching}, resumeRevision: 2, renderedRevision: -1,
    mentorGuidance: {version: 1 as const, text: coaching, resumeRevision: 2, current: true}}};
  const html = renderToStaticMarkup(<ResumeMentorOutcome result={coached} pendingCount={1}/>);
  expect(html).toContain('aria-label="导师的补强建议"');
  expect(html).toContain(coaching);
  expect(html).not.toContain('<details');
  expect(html).not.toContain(report);
  expect(html).not.toContain('open=');
  const stale = {...coached, f6Deliverables: {...coached.f6Deliverables,
    mentorGuidance: {...coached.f6Deliverables.mentorGuidance, current: false}}};
  expect(renderToStaticMarkup(<ResumeMentorOutcome result={stale}/>)).not.toContain(coaching);
});

test.each([0, 2])('unfinished author response overrides saved/accepted wording (pending=%s)', pendingCount => {
  const incomplete = {...result, f6Deliverables: {files: {}, resumeRevision: 1, renderedRevision: -1,
    reviewExecution: {version: 1 as const, status: 'author_response_incomplete' as const,
      certification: false as const, finalState: 'repair_incomplete:budget', authorBodySha256: 'test'},
    mentorGuidance: {version: 1 as const, text: '旧草稿补问', resumeRevision: 1, current: true}}};
  const html = renderToStaticMarkup(<ResumeMentorOutcome result={incomplete} pendingCount={pendingCount}/>);
  expect(html).toContain('返修还没完成');
  expect(html).not.toContain('新稿已保存');expect(html).not.toContain('修改已处理');
  expect(html).toContain('<summary>此前草稿的辅导 · 返修未完成</summary>');
  expect(html).not.toContain('open=');
  expect(html).not.toContain('aria-label="导师的补强建议"');
});
