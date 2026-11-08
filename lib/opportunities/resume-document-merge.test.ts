import {mergeResumeDocumentChanges} from './resume-document-merge';
import {applyResumeChanges} from '../coach-harness/application-quality';
import {decideResumeChange,decideResumeChanges} from './resume-agent-merge';
import type {ResumeChange} from './types';

const change=(id:string,before:string,after:string,status:ResumeChange['status']):ResumeChange=>({
  id,before,after,status,section:'项目',reason:'核对',evidenceId:null,
});
const source='甲原句\n乙原句\n丙原句';
const previous=[change('a','甲原句','甲已确认','accepted'),change('b','乙原句','乙拒绝稿','rejected'),
  change('c','丙原句','丙旧建议','pending')];
const fresh=[change('new',source,'新的完整成稿','pending')];

test('a full document survives old accepted/rejected ranges without auto-accepting',()=>{
  const snapshot=JSON.stringify(previous),merged=mergeResumeDocumentChanges(source,previous,fresh);
  expect(merged).toHaveLength(1);
  expect(merged[0].status).toBe('pending');
  expect(applyResumeChanges(source,merged)).toEqual({text:'新的完整成稿',findings:[]});
  expect(JSON.stringify(previous)).toBe(snapshot);
});
test('accept is exact author output; reject is exact previous CONFIRMED text, not the raw source or old rejected proposal',()=>{
  const merged=mergeResumeDocumentChanges(source,previous,fresh);
  const roundTrip=JSON.parse(JSON.stringify(merged)) as ResumeChange[];
  expect(applyResumeChanges(source,roundTrip.map(c=>decideResumeChange(c,'accepted'))).text).toBe('新的完整成稿');
  expect(applyResumeChanges(source,roundTrip.map(c=>decideResumeChange(c,'rejected'))).text)
    .toBe('甲已确认\n乙原句\n丙原句');
});
test('actual paper refusal restores every old accepted, pending and rejected choice after JSON refresh',()=>{
  const merged=JSON.parse(JSON.stringify(mergeResumeDocumentChanges(source,previous,fresh))) as ResumeChange[];
  const rejected=decideResumeChanges(merged,'new','rejected');
  expect(rejected).toEqual(previous);
  expect(applyResumeChanges(source,rejected)).toEqual(applyResumeChanges(source,previous));
  expect(applyResumeChanges(source,decideResumeChanges(merged,'new','accepted')).text).toBe('新的完整成稿');
});
test('no prior decisions leaves independent reversible F6 hunks intact',()=>{
  expect(mergeResumeDocumentChanges(source,[],fresh)).toEqual(fresh);
});
test('a regenerated document equal to the confirmed baseline cannot be billed as a new pending suggestion',()=>{
  const same=[change('new',source,'甲已确认\n乙原句\n丙原句','pending')];
  expect(mergeResumeDocumentChanges(source,previous,same)).toEqual(previous.slice(0,2));
});
test('unresolvable old human decisions fail closed rather than disappearing',()=>{
  expect(()=>mergeResumeDocumentChanges(source,[change('missing','不存在','新值','accepted')],fresh)).toThrow();
});
