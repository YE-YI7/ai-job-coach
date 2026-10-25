// No DB URL, credentials, published ports or remote commands: fresh Docker only.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {compareCatalog,sha256} from './schema-baseline-utils.mjs';
import {verifyLandingBudgetConcurrency} from './verify-landing-budget-concurrency.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const verification=path.join(root,'supabase/verification');
const manifest=JSON.parse(fs.readFileSync(path.join(verification,'production-20261023.json'),'utf8'));
const pending=JSON.parse(fs.readFileSync(path.join(verification,'pending-changes.json'),'utf8'));
assert.equal(pending.base,'production-20261023.json');
const container='yizhi-schema-'+randomUUID();
const image='postgres:17.6@sha256:00bc86618629af00d2937fdc5a5d63db3ff8450acf52f0636ec813c7f4902929';
const run=(args,input)=>{
  const result=spawnSync('docker',args,{input,encoding:'utf8',maxBuffer:8*1024*1024});
  if(result.status!==0)throw new Error(`Local Docker check failed (${args[0]}): ${result.stderr || result.stdout}`);
  return result.stdout;
};
const sql=text=>run(['exec','-i','-e','PGOPTIONS=-c search_path=public,extensions',container,
  'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','--single-transaction','-U','postgres','-d','yizhi_isolated'],text);
let created=false;
try {
  const files=fs.readdirSync(path.join(root,'supabase/migrations')).filter(f=>f.endsWith('.sql')).sort();
  const historyFiles=manifest.migrations.map(m=>m.file);
  assert.deepEqual(files,[...historyFiles,...pending.migrations.map(m=>m.file)],
    'Migration inventory differs from immutable history plus explicit pending changes');
  for(const migration of [...manifest.migrations,...pending.migrations]) {
    assert.equal(sha256(fs.readFileSync(path.join(root,'supabase/migrations',migration.file),'utf8')),migration.sha256,
      `Restored historical SQL changed: ${migration.file}`);
  }
  run(['run','--detach','--name',container,'--network','none',
    '-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_DB=yizhi_isolated',image]);
  created=true;
  let ready=false;
  for(let i=0;i<150;i++) {
    // The entrypoint briefly starts a socket-only server while initializing.
    // TCP readiness means initialization has finished, avoiding that false start.
    if(spawnSync('docker',['exec',container,'pg_isready','-h','127.0.0.1','-U','postgres','-d','yizhi_isolated']).status===0){ready=true;break;}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert(ready,'Isolated PostgreSQL did not start');
  sql(fs.readFileSync(path.join(verification,'platform.sql'),'utf8'));
  for(const file of historyFiles)sql(fs.readFileSync(path.join(root,'supabase/migrations',file),'utf8'));
  sql(fs.readFileSync(path.join(verification,'managed-defaults.sql'),'utf8'));
  const actual=JSON.parse(sql(fs.readFileSync(path.join(verification,'catalog.sql'),'utf8')));
  assert.deepEqual(compareCatalog(actual,manifest.sections),[],'Rebuilt schema differs from production reference');
  // Keep the production reference immutable. Pending changes may add only the
  // exact RPC identities/ACLs below; every pre-existing catalog entry must match.
  const isAdded=row=>pending.addedFunctions.some(f=>f.name===row.name&&f.args===row.args);
  assert.equal(actual.functions.filter(isAdded).length,0,'Pending function already exists in production reference');
  for(const migration of pending.migrations)
    sql(fs.readFileSync(path.join(root,'supabase/migrations',migration.file),'utf8'));
  const after=JSON.parse(sql(fs.readFileSync(path.join(verification,'catalog.sql'),'utf8')));
  assert.equal(after.functions.filter(isAdded).length,pending.addedFunctions.length);
  for(const added of pending.addedFunctions){
    const grants=after.function_grants.filter(row=>row.name===added.name&&row.args===added.args);
    assert.deepEqual(grants.map(row=>row.grantee).sort(),[...added.executeRoles].sort());
    assert(grants.every(row=>row.privilege==='EXECUTE'&&!row.grantable));
  }
  const unchanged={...after,functions:after.functions.filter(row=>!isAdded(row)),
    function_grants:after.function_grants.filter(row=>!isAdded(row))};
  assert.deepEqual(compareCatalog(unchanged,manifest.sections),[],
    'Pending migration changed pre-existing schema or unlisted catalog entries');
  // No production rows or seed users may enter the baseline.
  const emptyCheck=`do $$ declare t record; n bigint; begin
    for t in select tablename from pg_tables where schemaname='public' loop
      execute format('select count(*) from public.%I',t.tablename) into n;
      if n<>0 then raise exception 'Unexpected rows in %: %',t.tablename,n; end if;
    end loop; end $$;`;
  sql(emptyCheck);
  const concurrency=await verifyLandingBudgetConcurrency(container,sql);
  sql(emptyCheck);
  const tests=fs.readdirSync(path.join(root,'supabase/tests')).filter(f=>f.endsWith('.sql')).sort();
  assert(tests.includes('resume_billing_preservation.sql'),'Billing-boundary acceptance is required');
  for(const file of tests)sql(fs.readFileSync(path.join(root,'supabase/tests',file),'utf8'));
  sql(emptyCheck);
  const report={passed:true,at:new Date().toISOString(),image,migrations:files.length,
    historicalMigrations:historyFiles.length,pendingMigrations:pending.migrations.map(m=>m.file),
    pendingFunctions:pending.addedFunctions,sections:manifest.sections,tests,concurrency,
    productionWrites:0,productionRowsCopied:0};
  const outIndex=process.argv.indexOf('--out');
  if(outIndex>=0)fs.writeFileSync(path.resolve(process.argv[outIndex+1]),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
} finally {
  if(created)run(['rm','--force',container]);
}
