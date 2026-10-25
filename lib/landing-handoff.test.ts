import {claimLandingHandoff,completeLandingHandoff,LANDING_HANDOFF_KEY,landingHandoffHref,
  LANDING_PREVIEW_POLICY,parseLandingHandoffId,readLandingHandoff,saveLandingHandoff,
  saveLandingPreview,withoutLandingHandoff} from './landing-handoff';
const id='307a6142-9bb4-4e2d-9157-343b96a393c0';
function storage(){const data=new Map<string,string>();return {getItem:(k:string)=>data.get(k)??null,
  setItem:(k:string,v:string)=>{data.set(k,v);},removeItem:(k:string)=>{data.delete(k);}};}
test('keeps the exact Chinese sentence and emoji locally, never in the URL',()=>{
  const store=storage(),text='我是会计专业应届生，想转做运营，只有财务实习 🧾';
  const saved=saveLandingHandoff(store,text,id);
  expect(readLandingHandoff(store,id)?.text).toBe(text);
  expect(landingHandoffHref()).toBe('/cockpit?entry=one_sentence&handoff=1');
  expect(landingHandoffHref()).not.toContain(text);expect(landingHandoffHref()).not.toContain(saved.id);
});
test('same sentence reuses its response without another model intent',()=>{
  const store=storage(),saved=saveLandingHandoff(store,'想转行做运营',id);
  saveLandingPreview(store,saved,{source:'model',understanding:'你想从原岗位转做运营',
    nextStep:'选一个运营岗位。',policyVersion:LANDING_PREVIEW_POLICY});
  expect(saveLandingHandoff(store,'想转行做运营').preview?.source).toBe('model');
});
test('a late preview cannot replace a newer draft',()=>{
  const store=storage(),saved=saveLandingHandoff(store,'想做运营',id);
  saveLandingHandoff(store,'我改想做数据分析','0bbadade-6ffd-477e-91eb-448e105ed675');
  saveLandingPreview(store,saved,{source:'model',understanding:'旧输入',nextStep:'旧建议'});
  expect(readLandingHandoff(store,null)?.text).toBe('我改想做数据分析');
  expect(readLandingHandoff(store,null)?.preview).toBeUndefined();
});
test('old model output is hidden without losing the sentence; completion removes only the handoff flag',()=>{
  const store=storage(),saved=saveLandingHandoff(store,'我想转做运营',id);
  saveLandingPreview(store,saved,{source:'model',understanding:'用户想转运营',nextStep:'旧回复'});
  expect(readLandingHandoff(store,id)?.text).toBe('我想转做运营');
  expect(readLandingHandoff(store,id)?.preview).toBeUndefined();
  expect(withoutLandingHandoff('https://test.invalid/cockpit?entry=one_sentence&handoff=1&other=yes#goal'))
    .toBe('/cockpit?entry=one_sentence&other=yes#goal');
});
test('claimed input stays private to the first account and is cleared only after confirmed save',()=>{
  const store=storage();saveLandingHandoff(store,'我想转做运营',id);
  expect(claimLandingHandoff(store,id,'qa-owner')?.owner).toBe('qa-owner');
  expect(readLandingHandoff(store,id)).toBeNull();
  expect(claimLandingHandoff(store,id,'another-owner')).toBeNull();
  completeLandingHandoff(store,id,'another-owner');
  expect(readLandingHandoff(store,id,'qa-owner')).not.toBeNull();
  completeLandingHandoff(store,id,'qa-owner');expect(store.getItem(LANDING_HANDOFF_KEY)).toBeNull();
});
test('rejects expired, future-dated, corrupt and overlong local data',()=>{
  const store=storage();saveLandingHandoff(store,'虚构输入',id,1000);
  expect(readLandingHandoff(store,id,undefined,999)).toBeNull();
  expect(readLandingHandoff(store,id,undefined,1000+24*60*60*1000+1)).toBeNull();
  store.setItem(LANDING_HANDOFF_KEY,'{broken');expect(readLandingHandoff(store,id)).toBeNull();
  expect(()=>saveLandingHandoff(store,'长'.repeat(1001),id)).toThrow();
  expect(parseLandingHandoffId('constructor')).toBeNull();
});
