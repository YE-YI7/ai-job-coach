import { POST } from './route';
import { getDbClient } from '@/lib/db';
import { FakeDb } from '@/lib/coach-harness/run-ledger/testing/fake-db';
jest.mock('@/lib/db');
jest.mock('@/lib/session',()=>({createSessionToken:jest.fn(async()=> 'test-session'),sessionCookie:{name:'test-session',options:{httpOnly:true,path:'/'}}}));
jest.mock('@/lib/public-rate-limit',()=>({consumePublicRateLimit:jest.fn(async()=>({allowed:true})),rateLimitedResponse:jest.fn()}));
test('uppercase invite reuses the normalized Auth email rather than creating another application user',async()=>{
  const db=new FakeDb({invites:[{code:'QA-UPPERCASE',used:false,uses_count:0,max_uses:1}],users:[{id:'existing',email:'qa-uppercase@invite.local'}]});
  (getDbClient as jest.Mock).mockResolvedValue(db);
  const response=await POST(new Request('https://example.com/api/auth/verify-code',{method:'POST',body:JSON.stringify({email:'qa-uppercase@invite.local',code:'QA-UPPERCASE'})}));
  expect(response.status).toBe(200);expect(await response.json()).toMatchObject({ok:true,userId:'existing',isNewUser:false});
  expect(db.rows('users')).toHaveLength(1);
});
