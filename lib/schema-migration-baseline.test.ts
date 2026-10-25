import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const root=path.resolve(__dirname,'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'supabase/verification/production-20261023.json'),'utf8'));
const pending=JSON.parse(fs.readFileSync(path.join(root,'supabase/verification/pending-changes.json'),'utf8'));
describe('restored production migration history',()=>{
  test('all62 real versions are present once and retain accepted bytes',()=>{
    const files=fs.readdirSync(path.join(root,'supabase/migrations')).filter(f=>f.endsWith('.sql')).sort();
    expect(files).toEqual([...manifest.migrations,...pending.migrations].map((m:{file:string})=>m.file));
    expect(new Set(manifest.migrations.map((m:{version:string})=>m.version)).size).toBe(62);
    for(const m of [...manifest.migrations,...pending.migrations]){
      const text=fs.readFileSync(path.join(root,'supabase/migrations',m.file),'utf8');
      expect(createHash('sha256').update(text).digest('hex')).toBe(m.sha256);
    }
  });
  test('new RPC stays explicitly pending and cannot replace the historical reference',()=>{
    expect(pending.productionApplied).toBe(false);
    expect(pending.addedFunctions.map((x:{name:string})=>x.name)).toEqual(['consume_landing_mentor_budget']);
    const script=fs.readFileSync(path.join(root,'scripts/verify-schema-baseline.mjs'),'utf8');
    expect(script).toContain('compareCatalog(unchanged,manifest.sections)');
    expect(script).toContain('verifyLandingBudgetConcurrency(container,sql)');
    const sql=fs.readFileSync(path.join(root,'supabase/migrations',pending.migrations[0].file),'utf8');
    expect(sql).toContain('security invoker');
    expect(sql).toContain("exception when sqlstate 'PZL01'");
    expect(sql).not.toMatch(/watcha_point|interview_answer|user_quotas/);
  });
  test('rebuild cannot target production or publish a DB port',()=>{
    const script=fs.readFileSync(path.join(root,'scripts/verify-schema-baseline.mjs'),'utf8');
    expect(script).toContain("'--network','none'");
    expect(script).not.toMatch(/--linked|--db-url|SUPABASE_SERVICE_ROLE_KEY|DATABASE_URL/);
    expect(script).toContain("assert.deepEqual(compareCatalog(actual,manifest.sections),[]");
    expect(script).toContain('resume_billing_preservation');
  });
});
