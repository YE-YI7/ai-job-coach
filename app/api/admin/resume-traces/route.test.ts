import {GET} from "./route";
import {getCurrentUserFromRequest} from "@/lib/auth";
import {getDbClient} from "@/lib/db";
jest.mock("@/lib/auth",()=>({getCurrentUserFromRequest:jest.fn()}));
jest.mock("@/lib/db",()=>({getDbClient:jest.fn()}));
const original=process.env.ADMIN_EMAILS;
afterAll(()=>{if(original===undefined)delete process.env.ADMIN_EMAILS;else process.env.ADMIN_EMAILS=original;});
beforeEach(()=>{jest.clearAllMocks();process.env.ADMIN_EMAILS="owner@example.invalid";});
test("anonymous and ordinary users cannot see owner quality scores",async()=>{
  (getCurrentUserFromRequest as jest.Mock).mockResolvedValue(null);
  expect((await GET(new Request("https://example.com/api/admin/resume-traces"))).status).toBe(401);
  (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({email:"user@example.invalid",user_metadata:{admin:true}});
  expect((await GET(new Request("https://example.com/api/admin/resume-traces"))).status).toBe(403);
  expect(getDbClient).not.toHaveBeenCalled();
});
test("admin allowlist is required and query is bounded",async()=>{
  (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({email:"owner@example.invalid"});
  process.env.ADMIN_EMAILS="";
  expect((await GET(new Request("https://example.com/api/admin/resume-traces"))).status).toBe(403);
  process.env.ADMIN_EMAILS="OWNER@example.invalid";
  expect((await GET(new Request("https://example.com/api/admin/resume-traces?limit=1000"))).status).toBe(400);
  const query={eq:jest.fn().mockReturnThis(),order:jest.fn().mockReturnThis(),limit:jest.fn().mockResolvedValue({data:[{properties:{quality:{score:100}}}],error:null})};
  (getDbClient as jest.Mock).mockResolvedValue({from:jest.fn(()=>({select:()=>query}))});
  const response=await GET(new Request("https://example.com/api/admin/resume-traces?requestId=synthetic&limit=2"));
  expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(query.eq).toHaveBeenCalledWith("event_name","resume_agent_trace");
  expect(query.limit).toHaveBeenCalledWith(2);
});
