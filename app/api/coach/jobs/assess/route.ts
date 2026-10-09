import { getCurrentUserFromRequest } from '@/lib/auth';
import { getTaskLedger } from '@/lib/coach-harness/run-ledger';
import { createCockpitOpportunity, listCockpitOpportunities, readUserTierPreference } from '@/lib/coach-harness/repository';
import { profileFingerprint } from '@/lib/jobs/profile-fingerprint';
import { opportunityFromReviewedJob } from '@/lib/jobs/assessment-result';
import type { ReviewedJob } from '@/lib/jobs/personalization';
export const runtime='nodejs';
export const maxDuration=120;
export async function POST(request:Request){
 const user=await getCurrentUserFromRequest();
 if(!user)return Response.json({ok:false,error:'请先登录'},{status:401});
 try{
  const body=await request.json();
  if(typeof body.runId!=='string'||! /^[\da-f-]{36}$/i.test(body.runId)||typeof body.jobId!=='string'||typeof body.profileId!=='string')return Response.json({ok:false,error:'请选择已完成搜索中的岗位'},{status:400});
  const ledger=await getTaskLedger({userId:user.id,runId:body.runId});
  if(ledger.opportunityId!==body.profileId||ledger.billingUnit!=='job_search')return Response.json({ok:false,error:'搜索批次与这份简历不一致，本次未扣额度。'},{status:409});
  const result=(ledger.result??ledger.partialResult) as {jobs?:ReviewedJob[];profileFingerprint?:string}|null;
  const job=result?.jobs?.find(j=>j.id===body.jobId);
  if(!job?.review||!job.description)return Response.json({ok:false,error:'这条岗位没有已完成的评审，请重新查找。本次未扣额度。'},{status:409});
  const saved=await listCockpitOpportunities(user.id);
  const profile=saved.find(p=>p.id===body.profileId&&p.workspaceType==='preparation');
  if(!profile?.resumeText)return Response.json({ok:false,error:'基础简历不存在，请先恢复档案。'},{status:404});
  const preference=await readUserTierPreference(user.id);
  if(result?.profileFingerprint!==profileFingerprint(profile,preference.effectiveTiers))return Response.json({ok:false,error:'简历、方向或搜索范围已变更，请重新查找后保存判断。本次未扣额度。'},{status:409});
  if(job.review.resumeRefs.some(ref=>!profile.resumeText!.includes(ref.text)))return Response.json({ok:false,error:'简历证据已变更，请重新查找后再保存判断。本次未扣额度。'},{status:409});
  // Exact source URL avoids duplicate creates after a lost response or refresh.
  const existing=saved.find(p=>p.workspaceType==='job'&&p.jdText?.startsWith(`来源：${job.url}\n`));
  const opportunity=existing??await createCockpitOpportunity(user.id,opportunityFromReviewedJob(job,profile.resumeText));
  return Response.json({ok:true,opportunity,reused:Boolean(existing),quota:{consumed:0}},{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){console.error('Save existing job review failed',error);return Response.json({ok:false,error:'投递判断尚未保存，请重试。本次未扣额度，候选仍保留。'},{status:500});}
}
