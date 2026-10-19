import { GET } from "./route";
import { createSessionToken } from "@/lib/session";
import { exchangeCodeForToken, getWatchaUserInfo } from "@/lib/watcha-oauth";
import { getDbClient } from "@/lib/db";

jest.mock("@/lib/watcha-oauth", () => ({exchangeCodeForToken:jest.fn(),getWatchaUserInfo:jest.fn()}));
jest.mock("@/lib/db", () => ({getDbClient:jest.fn()}));
const originalSecret=process.env.SESSION_SECRET;
beforeEach(()=>{jest.resetAllMocks();process.env.SESSION_SECRET="watcha-repeat-test-secret-not-production-123456";});
afterAll(()=>{if(originalSecret===undefined)delete process.env.SESSION_SECRET;else process.env.SESSION_SECRET=originalSecret;});
function callback(cookie="",query="code=already-used&state=old-state"){
 return GET(new Request(`https://www.ai-job-coach.xin/api/auth/watcha/callback?${query}`,{headers:{cookie}}));
}
test("completed callback resumes a cryptographically verified session without exchanging code or touching DB",async()=>{
 const token=await createSessionToken("11111111-1111-4111-8111-111111111111");
 const r=await callback(`sb-access-token=${token}`);
 expect(r.headers.get("location")).toBe("https://www.ai-job-coach.xin/cockpit");
 expect(r.headers.get("cache-control")).toBe("private, no-store");
 expect(r.headers.get("set-cookie")).toBeNull();
 expect(exchangeCodeForToken).not.toHaveBeenCalled();expect(getDbClient).not.toHaveBeenCalled();
});
test.each(["","sb-access-token=forged","sb-session-user-id=11111111-1111-4111-8111-111111111111"])("missing state cookie without valid signed login still fails: %s",async(cookie)=>{
 const r=await callback(cookie);
 expect(new URL(r.headers.get("location")!).searchParams.get("error")).toBe("安全验证失败，请重试");
 expect(exchangeCodeForToken).not.toHaveBeenCalled();
});
test("a valid session does not bypass an in-progress mismatched state",async()=>{
 const token=await createSessionToken("11111111-1111-4111-8111-111111111111");
 const r=await callback(`sb-access-token=${token}; watcha_oauth_state=new-state`);
 expect(new URL(r.headers.get("location")!).pathname).toBe("/login");
 expect(exchangeCodeForToken).not.toHaveBeenCalled();
});
test("expired signed login cannot resume",async()=>{
 const token=await createSessionToken("11111111-1111-4111-8111-111111111111");
 const now=jest.spyOn(Date,"now").mockReturnValue(Date.now()+8*24*60*60*1000);
 try{expect(new URL((await callback(`sb-access-token=${token}`)).headers.get("location")!).pathname).toBe("/login");}
 finally{now.mockRestore();}
});
test("matching state still enters ordinary OAuth exchange",async()=>{
 jest.mocked(exchangeCodeForToken).mockRejectedValue(new Error("controlled test stop"));
 await callback("watcha_oauth_state=old-state");
 expect(exchangeCodeForToken).toHaveBeenCalledWith("already-used","https://www.ai-job-coach.xin");
});
test("new-domain callback passes its own origin to the same credential selector without touching DB on exchange failure",async()=>{
 jest.mocked(exchangeCodeForToken).mockRejectedValue(new Error("controlled test stop"));
 const response=await GET(new Request("https://yizhioffer.com/api/auth/watcha/callback?code=synthetic-new-code&state=synthetic-state",{headers:{cookie:"watcha_oauth_state=synthetic-state"}}));
 expect(exchangeCodeForToken).toHaveBeenCalledWith("synthetic-new-code","https://yizhioffer.com");
 expect(getDbClient).not.toHaveBeenCalled();
 expect(new URL(response.headers.get("location")!).origin).toBe("https://yizhioffer.com");
});

function existingAccountDb(existing:boolean,failedLookup=false){
 const query={select:jest.fn(),eq:jest.fn(),single:jest.fn(),update:jest.fn(),insert:jest.fn(),upsert:jest.fn().mockResolvedValue({error:null})};
 query.select.mockReturnValue(query);query.eq.mockReturnValue(query);query.update.mockReturnValue(query);
 query.single.mockResolvedValue({data:existing?{id:"11111111-1111-4111-8111-111111111111"}:null,error:failedLookup?{code:"unavailable"}:null});
 const db={from:jest.fn().mockReturnValue(query)};
 jest.mocked(getDbClient).mockResolvedValue(db as unknown as NonNullable<Awaited<ReturnType<typeof getDbClient>>>);
 jest.mocked(exchangeCodeForToken).mockResolvedValue({access_token:"synthetic-access",refresh_token:"synthetic-refresh",expires_in:300,token_type:"Bearer",scope:"read"});
 jest.mocked(getWatchaUserInfo).mockResolvedValue({user_id:123456789,nickname:"synthetic-user"});
 return {db,query};
}
const migrationCallback=()=>GET(new Request("https://yizhioffer.com/api/auth/watcha/callback?code=synthetic-code&state=synthetic-state",{headers:{cookie:"watcha_oauth_state=synthetic-state; watcha_oauth_existing_only=1"}}));
test.each([false,true])("迁移未找到旧身份时停止，不创建空账号、额度或保存 token，lookupFailure=%s",async failedLookup=>{
 const {db,query}=existingAccountDb(false,failedLookup);
 const response=await migrationCallback();
 expect(new URL(response.headers.get("location")!).searchParams.get("error")).toContain("未找到原工作区");
 expect(db.from).toHaveBeenCalledTimes(1);
 expect(query.insert).not.toHaveBeenCalled();expect(query.update).not.toHaveBeenCalled();expect(query.upsert).not.toHaveBeenCalled();
 expect(response.headers.get("set-cookie")).not.toContain("sb-access-token=");
});
test("迁移匹配同一已有 user_id 才建立正常会话，不触及简历和作答表",async()=>{
 const {db,query}=existingAccountDb(true);
 const response=await migrationCallback();
 expect(response.headers.get("location")).toBe("https://yizhioffer.com/cockpit");
 expect(query.insert).not.toHaveBeenCalled();
 expect(db.from.mock.calls.map(([table])=>table)).toEqual(["users","users","watcha_tokens"]);
 expect(response.headers.get("set-cookie")).toContain("sb-access-token=");
});
