import { POST } from "./route";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { listCockpitOpportunities } from "@/lib/coach-harness/repository";
import { fetchJobBoard } from "@/lib/jobs/discovery";
jest.mock("@/lib/auth");
jest.mock("@/lib/coach-harness/repository");
jest.mock("next/cache",()=>({unstable_cache:(fn:unknown)=>fn}));
jest.mock("@/lib/jobs/discovery",()=>({...jest.requireActual("@/lib/jobs/discovery"),fetchJobBoard:jest.fn()}));
const id="00000000-0000-4000-8000-000000000001";
const request=()=>new Request("http://localhost/api/coach/jobs/discover",{method:"POST",body:JSON.stringify({profileId:id})});
beforeEach(()=>{
  jest.resetAllMocks();
  (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({id:"owner"});
  (listCockpitOpportunities as jest.Mock).mockResolvedValue([{id,workspaceType:"preparation",role:"产品经理",location:"上海",resumeText:"Private resume"}]);
  (fetchJobBoard as jest.Mock).mockResolvedValue([]);
});
test("unauthenticated requests never fetch public sources or profiles",async()=>{
  (getCurrentUserFromRequest as jest.Mock).mockResolvedValue(null);
  expect((await POST(request())).status).toBe(401);expect(fetchJobBoard).not.toHaveBeenCalled();expect(listCockpitOpportunities).not.toHaveBeenCalled();
});
test("profile must belong to current user",async()=>{
  (listCockpitOpportunities as jest.Mock).mockResolvedValue([]);
  expect((await POST(request())).status).toBe(404);expect(listCockpitOpportunities).toHaveBeenCalledWith("owner");expect(fetchJobBoard).not.toHaveBeenCalled();
});
test("source fetch only receives company metadata, never resume or role",async()=>{
  const response=await POST(request());expect(response.status).toBe(200);
  expect(JSON.stringify((fetchJobBoard as jest.Mock).mock.calls)).not.toMatch(/Private resume|产品经理/);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
});
test("total source outage is an error, not no matching jobs",async()=>{
  (fetchJobBoard as jest.Mock).mockRejectedValue(Error("offline"));
  expect((await POST(request())).status).toBe(502);
});
test("partial source failure remains visible",async()=>{
  (fetchJobBoard as jest.Mock).mockRejectedValueOnce(Error("offline")).mockResolvedValueOnce([]);
  const response=await POST(request());expect(response.status).toBe(200);expect((await response.json()).failedSources).toEqual(["Meshy"]);
});
test("malformed request is not interpreted as a profile",async()=>{
  expect((await POST(new Request("http://localhost",{method:"POST",body:"{"}))).status).toBe(400);
});
