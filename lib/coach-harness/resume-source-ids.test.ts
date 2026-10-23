import {resolveResumeSourceIds} from './resume-source-ids';
const first='a5b0e202-981a-4396-bb04-aca2be5bceaf',second='3f98b7f7-07f6-4265-9ac1-22a42b2fa354';
test('replays the real repair UUID abbreviations against only request-scoped facts',()=>{
 expect(resolveResumeSourceIds(['a5b0e202','3f98b7f7'],new Set([first,second]))).toEqual({ids:[first,second],resolved:[{from:'a5b0e202',to:first},{from:'3f98b7f7',to:second}]});
});
test('unknown, ambiguous, short, arbitrary and excluded IDs never become citations',()=>{
 const allowed=new Set([first,'a5b0e202-2222-3333-4444-555555555555','label-one']);
 expect(resolveResumeSourceIds(['a5b0e202','3f98b7f7','a5b0','label','not-a-fact',null,12],allowed)).toEqual({ids:[],resolved:[]});
 expect(resolveResumeSourceIds(undefined,allowed)).toEqual({ids:[],resolved:[]});
 expect(resolveResumeSourceIds([first,first,'label-one'],allowed)).toEqual({ids:[first,'label-one'],resolved:[]});
});
