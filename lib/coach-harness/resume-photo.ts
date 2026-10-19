import { getDbClient } from "@/lib/db";
import type { ResumePhoto } from "@/lib/resume-photo";
import { ResumeRevisionConflict } from "@/lib/opportunities/resume-revision";

/** Only the photo pointer changes; an old client snapshot cannot replace the resume. */
export async function updateCockpitResumePhoto(userId: string, id: string, photo: ResumePhoto | null) {
  const db = await getDbClient();
  if (!db) throw Error("照片关联暂不可用");
  const current = await db.from("coach_opportunities").select("metadata,updated_at").eq("user_id",userId).eq("id",id).maybeSingle();
  if (current.error) throw current.error;
  if (!current.data) throw Error("岗位不存在");
  const metadata = {...current.data.metadata};
  if (photo) metadata.resumePhoto=photo;
  else delete metadata.resumePhoto;
  let write=db.from("coach_opportunities").update({metadata,updated_at:new Date().toISOString()}).eq("user_id",userId).eq("id",id);
  if (current.data.updated_at) write=write.eq("updated_at",current.data.updated_at);
  const result=await write.select("id").maybeSingle();
  if(result.error)throw result.error;
  if(!result.data)throw new ResumeRevisionConflict();
}
