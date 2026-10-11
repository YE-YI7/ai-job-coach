import {readFileSync} from 'node:fs';
import {join} from 'node:path';
const sql=readFileSync(join(process.cwd(),'supabase/migrations/20261011063000_persistent_mentor_turn_guard.sql'),'utf8');
describe('persistent mentor database guard',()=>{
 it('allows a different job in the same owner conversation',()=>{
   expect(sql).not.toContain('opportunity_id is not distinct from new.opportunity_id');
 });
 it('checks each turn job ownership independently',()=>{
   expect(sql).toContain('id=new.opportunity_id and user_id=new.user_id');
 });
 it('retains active-session ownership and archive version lock',()=>{
   expect(sql).toContain("id=new.session_id and user_id=new.user_id and status='active'");
   expect(sql).toContain('set version=version+1');
 });
 it('does not expose database writes to browser roles',()=>{
   expect(sql).toContain('security invoker');
   expect(sql).toContain('from public,anon,authenticated');
 });
});
