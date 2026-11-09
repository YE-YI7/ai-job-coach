import {GET,POST} from './route';
import {evalAdminAccess} from '@/lib/coach-harness/eval-admin-http';
import {readF6ReproInput,claimF6Repro,F6_REPRO_IDS} from '@/lib/coach-harness/f6-repro';
jest.mock('@/lib/coach-harness/eval-admin-http',()=>({evalAdminAccess:jest.fn(),
 evalJson:(body:unknown,status=200)=>Response.json(body,{status})}));
jest.mock('@/lib/coach-harness/f6-repro',()=>({F6_REPRO_IDS:['10163ccd-ebd1-4b05-9258-93af91e64bab'],
 readF6ReproInput:jest.fn(),claimF6Repro:jest.fn()}));
jest.mock('@/lib/coach-harness/resume-execution',()=>({runResumeDraft:jest.fn()}));
beforeEach(()=>{jest.clearAllMocks();});
test('both endpoints require an existing administrator identity before any read or model run',async()=>{
 (evalAdminAccess as jest.Mock).mockResolvedValue({user:null,error:Response.json({error:'login'},{status:401})});
 expect((await GET(new Request('https://site.invalid/api/admin/f6-repro?id='+F6_REPRO_IDS[0]))).status).toBe(401);
 expect((await POST(new Request('https://site.invalid/api/admin/f6-repro',{method:'POST'}))).status).toBe(401);
 expect(readF6ReproInput).not.toHaveBeenCalled();expect(claimF6Repro).not.toHaveBeenCalled();
});
test('zero fee GET validates the fixed trial id, and cross-origin POST cannot start it',async()=>{
 (evalAdminAccess as jest.Mock).mockResolvedValue({user:{id:'owner'},error:null});
 (readF6ReproInput as jest.Mock).mockResolvedValue({preflight:{modelCalls:0}});
 expect((await GET(new Request('https://site.invalid/api/admin/f6-repro?id='+F6_REPRO_IDS[0]))).status).toBe(200);
 expect((await GET(new Request('https://site.invalid/api/admin/f6-repro?id=other'))).status).toBe(400);
 expect((await POST(new Request('https://site.invalid/api/admin/f6-repro',{method:'POST',
  headers:{Origin:'https://evil.invalid',Host:'site.invalid','Content-Type':'application/json'},body:JSON.stringify({id:F6_REPRO_IDS[0]})}))).status).toBe(403);
 expect(claimF6Repro).not.toHaveBeenCalled();
});
test('native controls do not start a model, and the form retains all cross-site checks',async()=>{
 (evalAdminAccess as jest.Mock).mockResolvedValue({user:{id:'owner'},error:null});
 (readF6ReproInput as jest.Mock).mockResolvedValue({row:{status:'prepared'},preflight:{fullResumeCharacters:2420,modelCalls:0}});
 const page=await GET(new Request('https://site.invalid/api/admin/f6-repro?view=controls&id='+F6_REPRO_IDS[0]));
 expect(page.headers.get('content-type')).toContain('text/html');
 expect(await page.text()).toContain('开始本次真实复测');expect(claimF6Repro).not.toHaveBeenCalled();
 const response=await POST(new Request('https://site.invalid/api/admin/f6-repro',{method:'POST',
  headers:{Origin:'https://evil.invalid',Host:'site.invalid','Content-Type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({id:F6_REPRO_IDS[0]})}));
 expect(response.status).toBe(403);expect(claimF6Repro).not.toHaveBeenCalled();
});
