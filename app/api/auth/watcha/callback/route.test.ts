import { GET } from "./route";
import { createSessionToken } from "@/lib/session";
import { exchangeCodeForToken } from "@/lib/watcha-oauth";
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
