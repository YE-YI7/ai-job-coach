import {evalAdminAccess,evalJson} from '@/lib/coach-harness/eval-admin-http';
import {isSameOriginRequest} from '@/lib/phone-auth/security';
import {F6_REPRO_IDS,claimF6Repro,readF6ReproInput} from '@/lib/coach-harness/f6-repro';
import {runResumeDraft} from '@/lib/coach-harness/resume-execution';
import {F6_RESUME_WRITER} from '@/lib/coach-harness/resume-f6-writer';
import {withEvalObserver} from '@/lib/coach-harness/eval-scope';

export const runtime='nodejs';
export const maxDuration=300;
export async function GET(request:Request){
  const {user,error}=await evalAdminAccess();if(error||!user)return error!;
  const id=new URL(request.url).searchParams.get('id')||'';
  if(!F6_REPRO_IDS.includes(id))return evalJson({error:'仅允许本次三条验收'},400);
  try{
    const checked=await readF6ReproInput(user.id,id);
    if(new URL(request.url).searchParams.get('view')==='controls'){
      const prepared=checked.row.status==='prepared';
      return new Response(`<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>F6 三次对版复测</title>
<style>body{max-width:48rem;margin:3rem auto;padding:0 1.25rem;background:#fbfaf8;color:#29251f;font:17px/1.65 sans-serif}h1{font-size:1.75rem;line-height:1.3}p{margin:1.25rem 0}a{color:#984320;text-underline-offset:.2em}button{font:inherit;min-height:44px;padding:.6rem 1.2rem;background:#984320;color:#fff;border:0;border-radius:.4rem;cursor:pointer}button:hover{background:#29251f}button:focus-visible,a:focus-visible{outline:3px solid #29251f;outline-offset:4px}button:disabled{background:#686159;cursor:not-allowed}code{overflow-wrap:anywhere}</style>
<main><h1>F6 对版复测 · 第 ${F6_REPRO_IDS.indexOf(id)+1} 次</h1>
<p>三次合计最多 ¥0.50 / 36 次上游调用，每次最多 12 次。失败计入，不自动加跑，不扣个人钱包或益职积分。</p>
<p>首请求已核对：完整简历 ${checked.preflight.fullResumeCharacters} 字符、16 条原文项目事实、只输出益职段，不带旧编辑要求。与冻结 F6 输入一致。本页没有调用模型。</p>
<p>状态：${prepared?'等待开始':'已经领取或结束，请查看 Eval，勿重复提交'}。记录：<code>${id}</code></p>
<p><a href="?id=${id}">查看零费用首请求</a> · <a href="/admin/evals?run=${id}">查看本次 Eval / Trace</a></p>
<form method="post"><input type="hidden" name="id" value="${id}"><button type="submit"${prepared?'':' disabled'}>开始本次真实复测</button></form>
<p>提交后等待结果，不刷新或重复提交。程序通过不代表成稿质量通过；三份正文仍交 Claude 盲评。</p></main></html>`,
        {headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
    }
    return evalJson(checked.preflight);
  }
  catch(failure){return evalJson({error:failure instanceof Error?failure.message:'首请求检查失败',modelCalls:0},409);}
}
export async function POST(request:Request){
  const {user,error}=await evalAdminAccess();if(error||!user)return error!;
  const isForm=request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded');
  const checkHeaders=new Headers(request.headers);
  if(isForm)checkHeaders.set('Content-Type','application/json');
  if(!isSameOriginRequest(new Request(request.url,{method:'POST',headers:checkHeaders})))return evalJson({error:'不允许跨站调用'},403);
  const body=isForm?Object.fromEntries(new URLSearchParams(await request.text())):await request.json().catch(()=>null);
  if(!body||Object.keys(body).length!==1||!F6_REPRO_IDS.includes(body.id))return evalJson({error:'仅允许本次三条验收'},400);
  let audit:Awaited<ReturnType<typeof claimF6Repro>>|undefined;
  try{
    audit=await claimF6Repro(user.id,body.id);
    const response=await withEvalObserver(audit,()=>runResumeDraft(new Request(request.url,{
      method:'POST',body:JSON.stringify(audit!.request),
    }),user,{writer:F6_RESUME_WRITER,maxDraftAttempts:1,reviewPolicy:'on_demand',acceptance:audit!.execution}));
    const output=await response.clone().json();
    await audit.finish({output,httpStatus:response.status},output.ok?'completed':'failed');
    response.headers.set('x-yizhi-eval-id',body.id);return response;
  }catch(failure){
    const message=failure instanceof Error?failure.message:'F6_REPRO_FAILED';
    if(audit)await audit.finish({error:message},'failed');
    return evalJson({error:message},409);
  }
}
