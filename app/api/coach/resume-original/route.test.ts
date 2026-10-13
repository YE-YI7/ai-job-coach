import {POST,GET} from "./route";
import {createClient} from "@supabase/supabase-js";
import {getCurrentUserFromRequest} from "@/lib/auth";
jest.mock("@supabase/supabase-js");jest.mock("@/lib/auth");
const upload=jest.fn(),download=jest.fn(),getBucket=jest.fn(),createBucket=jest.fn();
const owner="6b21d8f0-17ba-4db5-a226-ab0994177c92";
beforeEach(()=>{
 jest.resetAllMocks();
 process.env.SUPABASE_URL="https://storage.example.com";process.env.SUPABASE_SERVICE_ROLE_KEY="test-only";
 (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({id:owner});
 getBucket.mockResolvedValue({data:{public:false},error:null});upload.mockResolvedValue({error:null});
 (createClient as jest.Mock).mockReturnValue({storage:{getBucket,createBucket,from:()=>({upload,download})}});
});
function request(bytes="%PDF-1.7\nunchanged-original") {const form=new FormData();form.set("file",new File([bytes],"中文简历.pdf",{type:"application/pdf"}));return new Request("https://example.com/api/coach/resume-original",{method:"POST",body:form});}
test("original upload and authenticated read preserve exact bytes",async()=>{
 const bytes="%PDF-1.7\nunchanged-original";
 const response=await POST(request(bytes));const body=await response.json();expect(response.status).toBe(200);
 expect(body.original.path).toMatch(new RegExp(`^${owner}/`));expect(upload.mock.calls[0][2]).toEqual({contentType:"application/pdf",upsert:false});
 expect(new TextDecoder().decode(upload.mock.calls[0][1])).toBe(bytes);
 download.mockResolvedValue({data:new Blob([bytes]),error:null});
 const read=await GET(new Request(`https://example.com/api/coach/resume-original?path=${body.original.path}`));
 expect(await read.text()).toBe(bytes);expect(read.headers.get("Cache-Control")).toBe("private, no-store");
});
test("foreign original is never read",async()=>{
 const response=await GET(new Request("https://example.com/api/coach/resume-original?path=other/6b21d8f0-17ba-4db5-a226-ab0994177c92.pdf"));expect(response.status).toBe(404);expect(download).not.toHaveBeenCalled();
});
test("public bucket and invalid PDF are rejected before upload",async()=>{
 getBucket.mockResolvedValue({data:{public:true},error:null});expect((await POST(request())).status).toBe(503);expect(upload).not.toHaveBeenCalled();
 expect((await POST(request("not a pdf"))).status).toBe(400);expect(upload).not.toHaveBeenCalled();
});
test("even bucket creation races recheck private access",async()=>{
 getBucket.mockResolvedValueOnce({error:{message:"not found"}}).mockResolvedValueOnce({data:{public:true},error:null});createBucket.mockResolvedValue({error:{message:"already exists"}});
 expect((await POST(request())).status).toBe(503);expect(upload).not.toHaveBeenCalled();
});
test("unauthenticated upload/read cannot access storage",async()=>{
 (getCurrentUserFromRequest as jest.Mock).mockResolvedValue(null);expect((await POST(request())).status).toBe(401);expect((await GET(new Request("https://example.com"))).status).toBe(401);expect(createClient).not.toHaveBeenCalled();
});
