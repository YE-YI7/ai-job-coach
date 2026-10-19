import { getDbClient } from "@/lib/db";
import { evalAdminAccess, evalJson as json } from "@/lib/coach-harness/eval-admin-http";
import { evalUuid } from "@/lib/coach-harness/eval-feedback";
export const runtime = "nodejs";
const view = (r: Record<string, unknown>) => ({id:r.id,label:r.label,status:r.status,createdAt:r.created_at,summary:r.summary});
export async function GET(request: Request) {
  const {error} = await evalAdminAccess(); if (error) return error;
  const id = new URL(request.url).searchParams.get("id");
  if (id && !evalUuid(id)) return json({error:"批次编号无效"},400);
  try {
    const db = await getDbClient(); if (!db) throw Error("unavailable");
    if (!id) {
      const result = await db.from("coach_eval_batches").select("id,label,status,created_at,summary").order("created_at",{ascending:false}).limit(30);
      if (result.error) throw result.error;
      return json({ok:true,batches:(result.data || []).map(view)});
    }
    const batch = await db.from("coach_eval_batches").select("id,label,status,created_at,config,summary").eq("id",id).maybeSingle();
    if (batch.error) throw batch.error;
    if (!batch.data) return json({error:"实验批次不存在"},404);
    // Do not load every stage prompt/I-O into a comparison list. Full evidence
    // remains available through the existing single-run endpoint.
    const rows = await db.from("coach_eval_runs").select("id,label,status,experiment:run->experiment,metrics:run->metrics,result:run->result,evaluation:run->evaluation").eq("run->experiment->>batchId",id).order("created_at",{ascending:true}).limit(100);
    if (rows.error) throw rows.error;
    return json({ok:true,batch:{...view(batch.data),config:batch.data.config},runs:(rows.data || []).map((row:Record<string,unknown>)=>{
      return {id:row.id,label:row.label,status:row.status,experiment:row.experiment,metrics:row.metrics,result:row.result,evaluation:row.evaluation};
    })});
  } catch { return json({error:"方案实验暂时无法读取，请重试"},503); }
}
