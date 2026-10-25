import {consumeLandingPreviewBudget} from '@/lib/landing-preview-budget';
import {parseLandingHandoffId} from '@/lib/landing-handoff';
import {generateLandingPreview,landingFallback} from '@/lib/landing-mentor';

export const runtime='nodejs';
export const maxDuration=30;
const respond=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
async function readBody(request:Request) {
  if(!request.body)throw Error('empty');
  const reader=request.body.getReader(),chunks:Uint8Array[]=[];
  let size=0;
  try {
    while(true){
      const chunk=await reader.read();if(chunk.done)break;
      size+=chunk.value.byteLength;
      if(size>6000){await reader.cancel();throw Error('large');}
      chunks.push(chunk.value);
    }
  } finally {reader.releaseLock();}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export async function POST(request:Request) {
  const target=new URL(request.url),host=request.headers.get('host')||target.host;
  const protocol=process.env.NODE_ENV==='production'?'https:':target.protocol;
  if(!request.headers.get('content-type')?.startsWith('application/json')||
    request.headers.get('origin')!==`${protocol}//${host}`||request.headers.get('sec-fetch-site')==='cross-site')
    return respond({ok:false,error:'请从益职首页开始。'},403);
  let body:Record<string,unknown>;
  try {body=await readBody(request);}catch {return respond({ok:false,error:'请缩短这句话，再试一次。'},400);}
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['message','requestId'].includes(k))||
    typeof body.message!=='string'||body.message.trim().length<2||body.message.length>1000||!parseLandingHandoffId(body.requestId))
    return respond({ok:false,error:'请写下 2–1000 字的困惑。'},400);
  const message=body.message.trim(),requestId=body.requestId as string;
  const fallback=()=>respond({ok:true,...landingFallback(message)});
  if(process.env.LANDING_MENTOR_PREVIEW_ENABLED!=='1')return fallback();
  try {
    // This route must fail closed if durable budget enforcement is unavailable.
    const budget=await consumeLandingPreviewBudget(request,requestId);
    if(!budget.allowed)return fallback();
    const preview=await generateLandingPreview(message,requestId,{
      onUsage:usage=>console.info('landing-preview-usage',JSON.stringify({requestId,...usage})),
    });
    return respond({ok:true,...preview});
  } catch {
    // No raw provider failure, prompt, UUID or credential reaches the UI/log.
    return fallback();
  }
}
