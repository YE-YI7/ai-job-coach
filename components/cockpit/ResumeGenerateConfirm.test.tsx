import React from 'react';
import {act,create,type ReactTestRenderer} from 'react-test-renderer';
import ResumeGenerateConfirm from './ResumeGenerateConfirm';

const originalFetch=global.fetch;
afterEach(()=>{global.fetch=originalFetch;});
const quota=(allowed:boolean)=>({ok:true,checks:{resume:{allowed,source:allowed?'paid':'free',remaining:allowed?1:0}},resumeTrial:{available:true}});
const dialog=()=>({showModal:jest.fn(),close:jest.fn()});

test('no start while checking, quota denial stays local and can refresh after top-up',async()=>{
  let resolve!:(value:Response)=>void;
  global.fetch=jest.fn(()=>new Promise<Response>(r=>{resolve=r;}));
  const onConfirm=jest.fn(),onClose=jest.fn();
  let root!:ReactTestRenderer;
  await act(async()=>{root=create(<ResumeGenerateConfirm fee="旧额度显示" onConfirm={onConfirm} onClose={onClose}/>,{createNodeMock:dialog});});
  const confirm=()=>root.root.findAllByType('button').find(node=>node.props.children==='确认并开始')!;
  expect(confirm().props.disabled).toBe(true);
  await act(async()=>{confirm().props.onClick();resolve(Response.json(quota(false)));});
  expect(onConfirm).not.toHaveBeenCalled();expect(confirm().props.disabled).toBe(true);
  expect(JSON.stringify(root.toJSON())).toContain('免费体验修改一段经历');
  global.fetch=jest.fn(async()=>Response.json(quota(true)));
  await act(async()=>{root.root.findAllByType('button').find(node=>node.props.children==='刷新额度')!.props.onClick();});
  expect(confirm().props.disabled).toBe(false);
  await act(async()=>{confirm().props.onClick();confirm().props.onClick();});
  expect(onConfirm).toHaveBeenCalledTimes(1);expect(onClose).toHaveBeenCalledTimes(1);
  await act(async()=>root.unmount());
});
test('quota error offers retry and never starts generation',async()=>{
  global.fetch=jest.fn(async()=>{throw Error('offline');});
  const onConfirm=jest.fn();let root!:ReactTestRenderer;
  await act(async()=>{root=create(<ResumeGenerateConfirm fee="费用待确认" onConfirm={onConfirm} onClose={()=>{}}/>,{createNodeMock:dialog});});
  expect(root.root.findByProps({role:'alert'}).children.join('')).toContain('未启动改稿');
  expect(root.root.findAllByType('button').find(node=>node.props.children==='确认并开始')!.props.disabled).toBe(true);
  expect(onConfirm).not.toHaveBeenCalled();await act(async()=>root.unmount());
});
