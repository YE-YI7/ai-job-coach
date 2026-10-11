export type MentorContinuation={sessionId:string|null;draft:string};
const key=(userId:string)=>`yizhi.mentor-continuation.v1:${userId}`;
export function readContinuation(store:Pick<Storage,"getItem">,userId:string,ownedIds:string[]):MentorContinuation|null{
 try{const v=JSON.parse(store.getItem(key(userId))||"null");
  if(!v||!(v.sessionId===null||ownedIds.includes(v.sessionId))||typeof v.draft!=="string"||v.draft.length>4000)return null;
  return {sessionId:v.sessionId,draft:v.draft};
 }catch{return null;}
}
export function writeContinuation(store:Pick<Storage,"setItem">,userId:string,value:MentorContinuation){
 try{store.setItem(key(userId),JSON.stringify(value));}catch{/* 云端已存对话不受浏览器存储限制影响。 */}
}
