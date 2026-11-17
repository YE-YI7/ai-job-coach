import React from 'react';
import {act,create,type ReactTestRenderer} from 'react-test-renderer';
import ResumeExport from './ResumeExport';
import {trackProductEvent} from '@/lib/product-events';
import {renderResumePrintWindow} from '@/lib/resume-print';

jest.mock('@/lib/product-events',()=>({trackProductEvent:jest.fn()}));
jest.mock('@/lib/resume-template-preference',()=>({useResumeTemplate:()=>['classic',jest.fn()]}));
jest.mock('@/lib/resume-photo',()=>({resumePhotoDataUri:jest.fn()}));
jest.mock('@/lib/resume-print',()=>({renderResumePrintWindow:jest.fn()}));
jest.mock('./ResumeTemplatePicker',()=>({__esModule:true,default:()=>null}));
const props={opportunityId:'11111111-1111-4111-8111-111111111119',baseText:'虚构简历正文不应进入埋点',generationId:'fixture:2',resumeRevision:'revision-2'};
const previousWindow=Object.getOwnPropertyDescriptor(global,'window');
const preview={document:{body:{textContent:''}},close:jest.fn(),opener:null};
beforeEach(()=>{
  jest.clearAllMocks();
  Object.defineProperty(global,'window',{configurable:true,value:{open:jest.fn(()=>preview)}});
});
afterEach(()=>{
  if(previousWindow)Object.defineProperty(global,'window',previousWindow);else Reflect.deleteProperty(global,'window');
});
const mount=async(pendingCount=0)=>{
  let root!:ReactTestRenderer;
  await act(async()=>{root=create(<ResumeExport {...props} compact pendingCount={pendingCount}/>,
    {createNodeMock:()=>({showModal:jest.fn(),close:jest.fn()})});});
  return root;
};
const button=(root:ReactTestRenderer,text:string)=>root.root.findAllByType('button').find(node=>node.children.includes(text))!;
test('click, preview, print and dialog return share an export ID, without claiming saved PDF',async()=>{
  const root=await mount();
  await act(async()=>button(root,'导出 PDF').props.onClick());
  const track=trackProductEvent as jest.Mock;
  expect(track.mock.calls.map(call=>call[0])).toEqual(['resume_export_clicked','resume_preview_ready']);
  const exportId=track.mock.calls[0][1].export_id;
  expect(exportId).toBeTruthy();
  expect(track.mock.calls[1][1]).toMatchObject({export_id:exportId,generation_id:'fixture:2',resume_revision:'revision-2'});
  const printArgs=(renderResumePrintWindow as jest.Mock).mock.calls[0];
  printArgs[4]();printArgs[6].onDialogClosed();printArgs[6].onFailed('font_unavailable');
  expect(track.mock.calls.map(call=>call[0])).toEqual([
    'resume_export_clicked','resume_preview_ready','resume_print_requested','resume_print_dialog_closed','resume_print_failed',
  ]);
  expect(JSON.stringify(track.mock.calls)).not.toContain(props.baseText);
  expect(JSON.stringify(track.mock.calls)).not.toMatch(/saved|download_success/);
  await act(async()=>root.unmount());
});
test('pending changes require consent; cancel and escape do not open or adopt anything',async()=>{
  const root=await mount(2);
  await act(async()=>button(root,'导出 PDF').props.onClick());
  expect(window.open).not.toHaveBeenCalled();
  await act(async()=>button(root,'继续核对').props.onClick());
  expect(trackProductEvent).toHaveBeenCalledWith('resume_export_cancelled',expect.any(Object));
  await act(async()=>button(root,'导出 PDF').props.onClick());
  await act(async()=>root.root.findByType('dialog').props.onCancel());
  expect(window.open).not.toHaveBeenCalled();expect(renderResumePrintWindow).not.toHaveBeenCalled();
  await act(async()=>root.unmount());
});
test('blocked popup is a preview failure, not a print or generation failure',async()=>{
  (window.open as jest.Mock).mockReturnValue(null);
  const root=await mount();await act(async()=>button(root,'导出 PDF').props.onClick());
  expect(trackProductEvent).toHaveBeenCalledWith('resume_preview_failed',expect.objectContaining({failure_stage:'popup_blocked'}));
  expect(root.root.findByProps({role:'alert'}).children.join('')).toContain('浏览器拦截');
  expect(renderResumePrintWindow).not.toHaveBeenCalled();await act(async()=>root.unmount());
});
