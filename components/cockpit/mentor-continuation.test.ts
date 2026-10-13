import {continuationDraft,readContinuation,writeContinuation} from './mentor-continuation';
const values=new Map<string,string>();
const store={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);}};
beforeEach(()=>values.clear());
test('发送清空输入框后仍保留原文，开会话失败前刷新也可恢复',()=>{writeContinuation(store,'owner',{sessionId:null,draft:continuationDraft('','原回答',false)});expect(readContinuation(store,'owner',[])).toEqual({sessionId:null,draft:'原回答'});expect(continuationDraft('','导师主动问题',true)).toBe('');expect(continuationDraft('下一条草稿','原回答',false)).toBe('下一条草稿');});
test('回来恢复同一对话和未发送草稿，不按岗位切换',()=>{writeContinuation(store,'owner',{sessionId:'chat',draft:'还没写完'});expect(readContinuation(store,'owner',['chat'])).toEqual({sessionId:'chat',draft:'还没写完'});});
test('账户隔离，已删除或不属于账号的对话不能恢复',()=>{writeContinuation(store,'a',{sessionId:'chat',draft:'private'});expect(readContinuation(store,'b',['chat'])).toBeNull();expect(readContinuation(store,'a',[])).toBeNull();});
test('用户主动新开后刷新仍为空，不强制回到旧对话',()=>{writeContinuation(store,'a',{sessionId:null,draft:'新问题'});expect(readContinuation(store,'a',['old'])).toEqual({sessionId:null,draft:'新问题'});});
test('损坏及超长草稿不恢复，禁用存储不抛错',()=>{store.setItem('yizhi.mentor-continuation.v1:a','{"sessionId":null,"draft":1}');expect(readContinuation(store,'a',[])).toBeNull();writeContinuation(store,'a',{sessionId:null,draft:'x'.repeat(4001)});expect(readContinuation(store,'a',[])).toBeNull();expect(()=>writeContinuation({setItem:()=>{throw Error();}},'a',{sessionId:null,draft:''})).not.toThrow();});
