import {getDbClient} from '@/lib/db';
import {evalAdminAccess,evalJson} from '@/lib/coach-harness/eval-admin-http';
import {evalUuid} from '@/lib/coach-harness/eval-feedback';
import {RECORD_TYPE,parseEvalRecord,recordHash,recordIndex,recordView,type EvalRecord} from '@/lib/coach-harness/eval-records';
export const runtime='nodejs';
export async function GET(request:Request){
 const {error}=await evalAdminAccess();if(error)return error;
 const p=new URL(request.url).searchParams,id=p.get('id'),file=p.get('file'),limit=Number(p.get('limit')||30);
 if((id&&!evalUuid(id))||(file&&(!id||!/^[a-z0-9-]{1,80}$/.test(file)))||!Number.isInteger(limit)||limit<1||limit>50)return evalJson({error:'查询参数无效'},400);
 try{
  const db=await getDbClient();if(!db)throw Error('unavailable');
  if(!id){
   const r=await db.from('coach_eval_runs').select('id,label,status,created_at,record_index:run->recordIndex').eq('run->>recordType',RECORD_TYPE).order('created_at',{ascending:false}).limit(limit);
   if(r.error)throw r.error;return evalJson({records:r.data||[]});
  }
  const r=await db.from('coach_eval_runs').select('run,created_at').eq('id',id).eq('run->>recordType',RECORD_TYPE).maybeSingle();
  if(r.error)throw r.error;if(!r.data)return evalJson({error:'记录不存在'},404);
  const record=r.data.run.record as EvalRecord;
  if(file){
   const attachment=record.attachments.find(a=>a.id===file);if(!attachment)return evalJson({error:'附件不存在'},404);
   return new Response(Buffer.from(attachment.base64,'base64'),{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="eval-evidence.pdf"; filename*=UTF-8''${encodeURIComponent(attachment.name)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',Vary:'Cookie'}});
  }
  return evalJson({record:recordView(record),createdAt:r.data.created_at});
 }catch{return evalJson({error:'记录暂时无法读取，请重试。'},503);}
}
export async function POST(request:Request){
 const {user,error}=await evalAdminAccess();if(error||!user)return error!;
 if(request.headers.get('origin')!==new URL(request.url).origin)return evalJson({error:'不允许跨站存档'},403);
 let record:EvalRecord|null;
 try{const raw=await request.text();if(Buffer.byteLength(raw)>800000)return evalJson({error:'记录过大，最多 800 KB'},413);record=parseEvalRecord(JSON.parse(raw));}catch{return evalJson({error:'存档 JSON 无效'},400);}
 if(!record)return evalJson({error:'记录结构无效，未保存；请核对证据类型、Trace、修改 ID 和附件。'},400);
 try{
  const db=await getDbClient();if(!db)throw Error('unavailable');
  const hash=recordHash(record),row={id:record.id,user_id:user.id,label:record.title,status:record.status==='blocked'?'blocked':'completed',run:{recordType:RECORD_TYPE,recordIndex:recordIndex(record),record,archiveHash:hash,provenance:'evidence_archive',spans:[]}};
  const saved=await db.from('coach_eval_runs').insert(row);
  if(saved.error){
   if(saved.error.code!=='23505')throw saved.error;
   const old=await db.from('coach_eval_runs').select('run').eq('id',record.id).maybeSingle();if(old.error)throw old.error;
   if(old.data?.run?.recordType!==RECORD_TYPE||old.data?.run?.archiveHash!==hash)return evalJson({error:'该编号已有其他内容，未覆盖。'},409);
   return evalJson({id:record.id,saved:true,replayed:true});
  }
  return evalJson({id:record.id,saved:true});
 }catch{return evalJson({error:'存档保存未确认，请按编号刷新核对，勿立即新建重复记录。'},503);}
}
