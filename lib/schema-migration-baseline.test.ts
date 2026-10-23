import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const root=path.resolve(__dirname,'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'supabase/verification/production-20261023.json'),'utf8'));
describe('restored production migration history',()=>{
  test('all62 real versions are present once and retain accepted bytes',()=>{
    const files=fs.readdirSync(path.join(root,'supabase/migrations')).filter(f=>f.endsWith('.sql')).sort();
    expect(files).toEqual(manifest.migrations.map((m:{file:string})=>m.file));
    expect(new Set(manifest.migrations.map((m:{version:string})=>m.version)).size).toBe(62);
    for(const m of manifest.migrations){
      const text=fs.readFileSync(path.join(root,'supabase/migrations',m.file),'utf8');
      expect(createHash('sha256').update(text).digest('hex')).toBe(m.sha256);
    }
  });
  test('rebuild cannot target production or publish a DB port',()=>{
    const script=fs.readFileSync(path.join(root,'scripts/verify-schema-baseline.mjs'),'utf8');
    expect(script).toContain("'--network','none'");
    expect(script).not.toMatch(/--linked|--db-url|SUPABASE_SERVICE_ROLE_KEY|DATABASE_URL/);
    expect(script).toContain("assert.deepEqual(compareCatalog(actual,manifest.sections),[]");
    expect(script).toContain('resume_billing_preservation');
  });
});
