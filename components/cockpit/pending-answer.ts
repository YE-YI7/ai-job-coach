export type PendingAnswer={text:string;sessionId:string;requestId:string};
type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
const key=(id:string)=>`yi-zhi.pending-answer.v1:${id}`;
export function pendingAnswerStore():Store {return {getItem:k=>{try{return sessionStorage.getItem(k);}catch{return null;}},setItem:(k,v)=>{try{sessionStorage.setItem(k,v);}catch{}},removeItem:k=>{try{sessionStorage.removeItem(k);}catch{}}};}
export function savePendingAnswer(store:Store,value:PendingAnswer){try{store.setItem(key(value.sessionId),JSON.stringify(value));}catch{/* 浏览器禁用存储时仍可在当前页面重试。 */}}
export function clearPendingAnswer(store:Store,id:string){try{store.removeItem(key(id));}catch{}}
/** 只在服务端已确认属于当前用户的会话加载成功后调用。 */
export function readPendingAnswer(store:Store,id:string):PendingAnswer|null{
 try{const v=JSON.parse(store.getItem(key(id))||'null');return v&&v.sessionId===id&&typeof v.text==='string'&&v.text.trim()&&v.text.length<=4000&&typeof v.requestId==='string'&&/^[a-f0-9-]{36}$/i.test(v.requestId)?v:null;}catch{return null;}
}
