import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ResumeEvidenceNotices from './ResumeEvidenceNotices';
import type {ResumeChange} from '@/lib/opportunities/types';

const change:ResumeChange={id:'a',section:'项目',before:'整理记录。',after:'主导500人调研。',
  reason:'待确认稿',evidenceId:null,status:'pending',evidenceNotices:[{
    code:'number_not_found',quote:'500人',start:2,end:6,message:'这处数字在原材料里没找到，请确认。',
  }]};
test('notice shows the exact quote and says confirmation is optional, not a rejection or verified fact',()=>{
  const html=renderToStaticMarkup(<ResumeEvidenceNotices change={change}/>);
  expect(html).toContain('<mark>500人</mark>');
  expect(html).toContain('仍可采纳或保留原文');
  expect(html).toContain('依据待确认的表述');
  expect(html).not.toContain('事实通过');expect(html).not.toContain('disabled');
});
test('old records and stale annotation offsets do not display wrong warnings on another text',()=>{
  expect(renderToStaticMarkup(<ResumeEvidenceNotices change={{...change,evidenceNotices:undefined}}/>)).toBe('');
  expect(renderToStaticMarkup(<ResumeEvidenceNotices change={{...change,after:'本人手写的新文字。'}}/>)).toBe('');
});
