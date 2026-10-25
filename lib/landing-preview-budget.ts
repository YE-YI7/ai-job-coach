import {getDbClient} from './db';
import {getClientAddress,hashRateLimitIdentity,type PublicRateLimitResult} from './public-rate-limit';

/** Three durable counters succeed or roll back together; no refunds after a model starts. */
export async function consumeLandingPreviewBudget(request:Request,requestId:string):Promise<PublicRateLimitResult> {
  const secret=process.env.RATE_LIMIT_SECRET||process.env.SESSION_SECRET||process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!secret)throw Error('landing budget unavailable');
  const db=await getDbClient();
  if(!db)throw Error('landing budget unavailable');
  const hash=(scope:string,address:string,subject='')=>hashRateLimitIdentity(scope,address,subject,secret);
  const {data,error}=await db.rpc('consume_landing_mentor_budget',{
    p_ip_key_hash:hash('landing-mentor-ip',getClientAddress(request)),
    p_global_key_hash:hash('landing-mentor-global','0.0.0.0'),
    // Per intent, not per IP: switching networks must not duplicate a paid attempt.
    p_intent_key_hash:hash('landing-mentor-once','0.0.0.0',requestId),
  });
  if(error)throw Error('landing budget unavailable');
  const row=Array.isArray(data)?data[0]:data;
  if(!row||typeof row.allowed!=='boolean')throw Error('landing budget unavailable');
  return {
    allowed:row.allowed,
    remaining:0,
    retryAfterSeconds:Math.max(1,Number(row.retry_after_seconds)||86400),
  };
}
