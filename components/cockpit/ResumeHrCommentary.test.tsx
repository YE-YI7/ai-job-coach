import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ResumeHrCommentary from './ResumeHrCommentary';
import type {Opportunity} from '@/lib/opportunities/types';
jest.mock('./TutorMarkdown',()=>({__esModule:true,default:({children}:{children:string})=><p>{children}</p>}));
const quality:NonNullable<Opportunity['applicationQuality']>={artifactId:'a',version:1,status:'draft',reviews:[{
  reviewerType:'independent_ai',status:'warning',summary:'独立 HR 点评（针对首稿）\n未再复审。原文只有参与，请核实主导。',
}]};
test('raw HR commentary has a collapsed entry, no success or blocking controls',()=>{
  const html=renderToStaticMarkup(<ResumeHrCommentary quality={quality}/>);
  expect(html).toContain('查看 HR 点评');expect(html).toContain(quality.reviews[0].summary);
  expect(html).not.toContain('open=');expect(html).not.toContain('disabled');
});
test('historical reviews or stale commentary after manual edits do not masquerade as current HR',()=>{
  expect(renderToStaticMarkup(<ResumeHrCommentary quality={undefined}/>)).toBe('');
  expect(renderToStaticMarkup(<ResumeHrCommentary quality={{...quality,
    reviews:[{...quality.reviews[0],status:'not_run'}]}}/>)).toBe('');
  const restored=renderToStaticMarkup(<ResumeHrCommentary quality={quality} stale/>);
  expect(restored).toContain('查看修改前 HR 点评');
  expect(restored).toContain('不覆盖你后来的修改');
});
