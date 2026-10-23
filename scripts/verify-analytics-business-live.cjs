/* Read-only acceptance. Run under Vercel's existing production environment.
 * No cookies, tokens, content or identifiers are printed/saved. Every network
 * request is restricted to GET on the already configured Supabase origin.
 */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const {createClient}=require('@supabase/supabase-js');
if(process.env.ANALYTICS_READONLY_ACCEPTANCE!=='1')throw Error('Explicit readonly acceptance flag required');
const origin=process.env.SUPABASE_URL;
if(!origin||new URL(origin).hostname!=='wynjnexofolzusmtjltd.supabase.co'||!process.env.SUPABASE_SERVICE_ROLE_KEY)throw Error('Expected production DB configuration not available; no fallback');
process.env.VERCEL_ENV='production';
const nativeFetch=global.fetch,db=createClient(origin,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{autoRefreshToken:false,persistSession:false},global:{fetch:(url,options={})=>{
 if(new URL(String(url)).origin!==new URL(origin).origin||(options.method||'GET')!=='GET')throw Error('Readonly acceptance blocked network operation');
 return nativeFetch(url,options);
}}});
const root=path.resolve(__dirname,'..'),cache=new Map();
let acceptanceStage='load';
function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const module={exports:{}};cache.set(file,module);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const localRequire=name=>{if(name==='server-only')return {};if(name==='@/lib/db')return {getDbClient:async()=>db};if(name.startsWith('node:'))return require(name);if(name.startsWith('.')||name.startsWith('@/')){const resolved=name.startsWith('@/')?path.join(root,name.slice(2)):path.resolve(path.dirname(file),name);return load(resolved+'.ts');}return require(name);};vm.runInThisContext(`(function(require,module,exports){${code}\n})`,{filename:file})(localRequire,module,module.exports);return module.exports;
}
(async()=>{
 const store=load(path.join(root,'lib/admin-analytics-business-store.ts'));
 acceptanceStage='dataset';
 const from=process.env.ANALYTICS_FROM||'2026-10-21',to=process.env.ANALYTICS_TO||'2026-10-22';
 const dataset=await store.readBusinessDataset(db,from,to,undefined,0,{});
 const internal=(process.env.ANALYTICS_INTERNAL_USER_IDS||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
 if(!internal.length||dataset.users.rows.some(u=>internal.includes(u.id.toLowerCase())))throw Error('Exclusion mismatch');
 for(const id of internal){if(await store.readBusinessSessions(db,id.toUpperCase(),from,to,{asOf:dataset.window.asOf})!==null)throw Error('Direct owner exclusion mismatch');}
 const user=dataset.users.rows.find(u=>u.active),detail=user?await store.readBusinessSessions(db,user.id,from,to,{asOf:dataset.window.asOf}):null;
 acceptanceStage='session';
 const session=detail?.sessionPage.rows[0],chat=session?await store.readBusinessSessions(db,user.id,from,to,{asOf:dataset.window.asOf,session:session.id}):null;
 const job=detail?.opportunities[0],material=job?await store.readBusinessMaterial(db,user.id,job.id):null;
 console.log(JSON.stringify({readonly:true,from,to,asOf:dataset.window.asOf,users:dataset.users.total,days:dataset.rows,ownerExclusionsChecked:internal.length,detail:detail?{sessions:detail.sessionPage.total,messages:chat?.selectedSession?.turns.total||0,events:detail.events.total,traces:detail.traces.length,materials:detail.opportunities.length}:null,material:material?{readable:true,truncated:material.truncated}:null},null,2));
})().catch(error=>{const code=['analytics_capacity','analytics_exclusions_missing','invalid_date','invalid_asof'].includes(error?.message)?error.message:/^[A-Z0-9_]{2,32}$/.test(error?.code||'')?error.code:error?.name||'read_failed';console.error(JSON.stringify({readonly:true,stage:acceptanceStage,code}));process.exitCode=1;});
