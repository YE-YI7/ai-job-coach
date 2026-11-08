import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ResumeGenerationNotice from './ResumeGenerationNotice';
import type {ResumeAgentTask} from '@/lib/coach-harness/resume-task-types';

const task=(state:ResumeAgentTask['state']):ResumeAgentTask=>({
  id:'fictional-task',state,answers:[],question:null,updatedAt:'2026-11-08T00:00:00Z',
});
test('failure next to paper identifies retained old suggestions, without claiming new delivery or a refund',()=>{
  const html=renderToStaticMarkup(<ResumeGenerationNotice task={task('failed')} hasSavedChanges/>);
  expect(html).toContain('此前保存');
  expect(html).toContain('不是本次新稿');
  expect(html).not.toMatch(/已扣|未扣|退款|成功/);
  expect(html).toContain('role="status"');
});
test('failure with no old changes honestly labels the original',()=>{
  const html=renderToStaticMarkup(<ResumeGenerationNotice task={task('failed')} hasSavedChanges={false}/>);
  expect(html).toContain('保留原简历');
  expect(html).not.toContain('此前保存');
});
test.each(['ready','running','idle','needs_detail','stale'] as const)('no stale failure notice in %s',state=>{
  expect(renderToStaticMarkup(<ResumeGenerationNotice task={task(state)} hasSavedChanges/>)).toBe('');
});
