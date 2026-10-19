import {POST,GET,DELETE} from "./route";
import {createClient} from "@supabase/supabase-js";
import {getCurrentUserFromRequest} from "@/lib/auth";
import {getDbClient} from "@/lib/db";
jest.mock("@supabase/supabase-js");jest.mock("@/lib/auth");jest.mock("@/lib/db");
const owner="11111111-2222-4333-8444-555555555555",path=`${owner}/9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d.png`;
const upload=jest.fn(),download=jest.fn(),remove=jest.fn(),getBucket=jest.fn(),createBucket=jest.fn(),limit=jest.fn();
beforeEach(()=>{
 jest.resetAllMocks();process.env.SUPABASE_URL="https://storage.example.test";process.env.SUPABASE_SERVICE_ROLE_KEY="test-only";
 (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({id:owner});
 getBucket.mockResolvedValue({data:{public:false},error:null});upload.mockResolvedValue({error:null});remove.mockResolvedValue({error:null});limit.mockResolvedValue({data:[],error:null});
 const query={select:jest.fn().mockReturnThis(),eq:jest.fn().mockReturnThis(),limit};
 (getDbClient as jest.Mock).mockResolvedValue({from:()=>query});
 (createClient as jest.Mock).mockReturnValue({storage:{getBucket,createBucket,from:()=>({upload,download,remove})}});
});
function request(bytes:Uint8Array=new Uint8Array([137,80,78,71,13,10,26,10])){const body=new FormData();body.set("file",new File([new Uint8Array(bytes)],"合成验收.png",{type:"image/png"}));body.set("previous",path);return new Request("https://example.test/api/coach/resume-photo",{method:"POST",body});}
test("upload never deletes the old photo before the metadata save receipt",async()=>{const r=await POST(request());expect(r.status).toBe(200);expect((await r.json()).photo.path).toMatch(new RegExp(`^${owner}/`));expect(remove).not.toHaveBeenCalled();});
test("a photo still referenced by another resume is never physically removed",async()=>{limit.mockResolvedValue({data:[{id:"another-resume"}],error:null});const r=await DELETE(new Request(`https://example.test?path=${path}`));expect(await r.json()).toEqual({ok:true,retained:true});expect(remove).not.toHaveBeenCalled();});
test("unreferenced own photo may be cleaned up, but unknown reference state fails closed",async()=>{expect((await DELETE(new Request(`https://example.test?path=${path}`))).status).toBe(200);expect(remove).toHaveBeenCalledWith([path]);remove.mockClear();limit.mockResolvedValue({data:null,error:Error("unavailable")});expect((await DELETE(new Request(`https://example.test?path=${path}`))).status).toBe(503);expect(remove).not.toHaveBeenCalled();});
test("other account paths never reach storage",async()=>{const foreign=path.replace(owner,"22222222-2222-4333-8444-555555555555");for(const method of [GET,DELETE])expect((await method(new Request(`https://example.test?path=${foreign}`))).status).toBe(404);expect(createClient).not.toHaveBeenCalled();});
test("private read returns exact bytes with no public cache",async()=>{download.mockResolvedValue({data:new Blob(["synthetic-image"]),error:null});const r=await GET(new Request(`https://example.test?path=${path}`));expect(await r.text()).toBe("synthetic-image");expect(r.headers.get("cache-control")).toBe("private, no-store");expect(r.headers.get("x-content-type-options")).toBe("nosniff");});
test("public bucket, invalid image and oversize file fail before upload",async()=>{getBucket.mockResolvedValue({data:{public:true},error:null});expect((await POST(request())).status).toBe(503);expect((await POST(request(new TextEncoder().encode("<svg/>")))).status).toBe(400);expect((await POST(request(new Uint8Array(1024*1024+1)))).status).toBe(400);expect(upload).not.toHaveBeenCalled();});
test("upload, read and deletion all require authentication",async()=>{(getCurrentUserFromRequest as jest.Mock).mockResolvedValue(null);expect((await POST(request())).status).toBe(401);for(const method of [GET,DELETE])expect((await method(new Request(`https://example.test?path=${path}`))).status).toBe(401);expect(createClient).not.toHaveBeenCalled();});
