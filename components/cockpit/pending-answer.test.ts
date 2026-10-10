import {savePendingAnswer,readPendingAnswer,clearPendingAnswer} from './pending-answer';
test('失败回答刷新可恢复同一请求，不串会话；成功才清理',()=>{
 const data=new Map<string,string>();const store={getItem:(k:string)=>data.get(k)||null,setItem:(k:string,v:string)=>{data.set(k,v);},removeItem:(k:string)=>{data.delete(k);}};
 const draft={text:'我没有AI项目，只做过权限灰度。',sessionId:'owned-session',requestId:'11111111-1111-4111-8111-111111111111'};
 savePendingAnswer(store,draft);expect(readPendingAnswer(store,'other-account-session')).toBeNull();expect(readPendingAnswer(store,draft.sessionId)).toEqual(draft);
 clearPendingAnswer(store,draft.sessionId);expect(readPendingAnswer(store,draft.sessionId)).toBeNull();
});
test('存储不可用不阻断对话',()=>{const store={getItem:()=>{throw Error('disabled');},setItem:()=>{throw Error('disabled');},removeItem:()=>{throw Error('disabled');}};expect(readPendingAnswer(store,'s')).toBeNull();expect(()=>savePendingAnswer(store,{text:'回答',sessionId:'s',requestId:'r'})).not.toThrow();});
