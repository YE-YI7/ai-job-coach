import { NextRequest } from "next/server";
import { getDbClient } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { createSessionToken } from "@/lib/session";
import { checkPhoneCode, sendPhoneCode, SmsProviderError } from "./provider";
import { phoneSend, phoneStatus, phoneVerify } from "./handlers";
import { phoneCookie } from "./security";
import { FakeDb } from "@/lib/coach-harness/run-ledger/testing/fake-db";

jest.mock("@/lib/db");
jest.mock("@/lib/auth");
jest.mock("@/lib/session", () => ({ createSessionToken: jest.fn(async () => "signed-session"), sessionCookie: { name: "sb-access-token", options: { httpOnly: true, path: "/" } } }));
jest.mock("./provider", () => ({ phoneAuthConfigured: jest.fn(() => true), smsSignName: () => "恒创联众", sendPhoneCode: jest.fn(), checkPhoneCode: jest.fn(),
  SmsProviderError: class extends Error { constructor(public readonly kind: "limited" | "unavailable") { super("短信认证暂时不可用"); } },
}));

const challenge = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const token = "a".repeat(43);
let db: FakeDb & { type: string; rpc: jest.Mock };
function request(body: Record<string, unknown>, headers: Record<string,string> = {}) {
  return new NextRequest("https://example.com/api/auth/phone/verify", { method: "POST", headers: {
    "Content-Type": "application/json", Origin: "https://example.com", Cookie: `${phoneCookie.name}=${token}`, ...headers,
  }, body: JSON.stringify(body) });
}
const verifyBody = { purpose: "login", challengeId: challenge, code: "123456" };
beforeEach(() => {
  jest.clearAllMocks();
  process.env.SESSION_SECRET = "test-session-secret-at-least-32-characters";
  db = Object.assign(new FakeDb({ users: [{ id: userId, phone: null }], phone_auth_challenges: [{ id: challenge, state: "sending", created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 300_000).toISOString() }] }), {
    type: "supabase", rpc: jest.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === "begin_phone_auth" || name === "begin_phone_recovery") {
        db.applyInsert("phone_auth_challenges", [{ id: args.p_id, state: "sending", created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 300_000).toISOString() }]);
      }
      return { data: name === "consume_public_action_rate_limit" ? [{ allowed: true }]
      : name === "claim_phone_auth" ? { status: "ready", phone: "+8613800138000" }
      : name === "finish_phone_auth" ? { status: "ok", user_id: userId, is_new_user: false, email: "old@example.com" }
      : { status: "ready" }, error: null }; }),
  });
  (getDbClient as jest.Mock).mockResolvedValue(db);
  (getCurrentUserFromRequest as jest.Mock).mockResolvedValue(null);
  (sendPhoneCode as jest.Mock).mockResolvedValue(undefined);
  (checkPhoneCode as jest.Mock).mockResolvedValue(true);
});
test("rejects cross-origin and missing-origin requests before provider or database writes", async () => {
  expect((await phoneSend(request({ purpose: "login", phone: "13800138000", consent: true }, { Origin: "https://evil.example" }))).status).toBe(403);
  expect((await phoneVerify(request(verifyBody, { Origin: "" }))).status).toBe(403);
  expect(db.rpc).not.toHaveBeenCalled(); expect(sendPhoneCode).not.toHaveBeenCalled();
});
test("binding needs the current signed session, never a caller-supplied user id", async () => {
  expect((await phoneSend(request({ purpose: "bind", phone: "13800138000", userId, consent: true }))).status).toBe(401);
  expect(sendPhoneCode).not.toHaveBeenCalled();
});
test("recovery cannot run as anonymous login or without the original signed account", async()=>{
  expect((await phoneSend(request({purpose:'login',phone:'13800138000',consent:true,recovery:true}))).status).toBe(400);
  expect((await phoneSend(request({purpose:'bind',phone:'13800138000',consent:true,recovery:true}))).status).toBe(401);
  expect(sendPhoneCode).not.toHaveBeenCalled();
});
test("explicit recovery is bound to the current account and durable challenge", async()=>{
  (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({id:userId});
  const response=await phoneSend(request({purpose:'bind',phone:'13800138000',consent:true,recovery:true,userId:'forged'}));
  expect(response.status).toBe(200);
  expect(db.rpc).toHaveBeenCalledWith('begin_phone_recovery',expect.objectContaining({p_user_id:userId,p_purpose:'bind'}));
  expect(await response.json()).toMatchObject({recovery:true});
});
test("the recovery finisher still needs provider PASS and does not mint another user's cookie",async()=>{
  (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({id:userId});
  const original=db.rpc.getMockImplementation()!;
  db.rpc.mockImplementation((name,args)=>name==='finish_phone_recovery'?{data:{status:'ok',user_id:userId,is_new_user:false},error:null}:original(name,args));
  const response=await phoneVerify(request({...verifyBody,purpose:'bind',recovery:true}));
  expect(response.status).toBe(200);
  expect(db.rpc).toHaveBeenCalledWith('finish_phone_recovery',expect.objectContaining({p_user_id:userId,p_outcome:'pass'}));
  expect(createSessionToken).not.toHaveBeenCalled();
});
test("data or paid balance in a phone account prevents automatic association",async()=>{
  (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({id:userId});
  const original=db.rpc.getMockImplementation()!;
  db.rpc.mockImplementation((name,args)=>name==='finish_phone_recovery'?{data:{status:'account_has_data'},error:null}:original(name,args));
  const response=await phoneVerify(request({...verifyBody,purpose:'bind',recovery:true}));
  expect(response.status).toBe(409);expect(await response.json()).toMatchObject({code:'account_has_data'});
  expect(createSessionToken).not.toHaveBeenCalled();
});
test("a logged-in account cannot silently create or switch to an empty phone account", async () => {
  (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({ id: userId });
  expect((await phoneSend(request({ purpose: "login", phone: "13800138000", consent: true }))).status).toBe(409);
});
test("missing database fails closed without sending SMS", async () => {
  (getDbClient as jest.Mock).mockResolvedValue(null);
  expect((await phoneSend(request({ purpose: "login", phone: "13800138000", consent: true }))).status).toBe(503);
  expect(sendPhoneCode).not.toHaveBeenCalled();
});
test("applies shared IP, number and global caps, not IP-scoped number caps", async () => {
  await phoneSend(request({ purpose: "login", phone: "13800138000", consent: true }));
  expect(db.rpc.mock.calls.filter(c => c[0] === "consume_public_action_rate_limit").map(c => c[1].p_scope))
    .toEqual(["phone-send-ip", "phone-send-number", "phone-send-global"]);
});
test("does not send past a rate limit or without explicit SMS consent", async () => {
  expect((await phoneSend(request({ purpose: "login", phone: "13800138000" }))).status).toBe(400);
  db.rpc.mockResolvedValue({ data: [{ allowed: false, retry_after_seconds: 60 }], error: null });
  expect((await phoneSend(request({ purpose: "login", phone: "13800138000", consent: true }))).status).toBe(429);
  expect(sendPhoneCode).not.toHaveBeenCalled();
});
test.each(["limited", "unavailable"] as const)("handles provider %s errors without hiding rate limits behind generic 503", async kind => {
  (sendPhoneCode as jest.Mock).mockRejectedValue(new SmsProviderError(kind));
  const response = await phoneSend(request({purpose:"login",phone:"13800138000",consent:true}));
  expect(response.status).toBe(kind === "limited" ? 429 : 503);
  expect(await response.json()).toMatchObject({ok:false,code:kind === "limited" ? "provider_limited" : "unavailable"});
  expect(sendPhoneCode).toHaveBeenCalledTimes(1);
});
test("requires browser proof before verifying any OTP", async () => {
  expect((await phoneVerify(request(verifyBody, { Cookie: "" }))).status).toBe(410);
  expect(checkPhoneCode).not.toHaveBeenCalled();
});
test.each(["busy", "expired", "invalid"])("a %s challenge cannot invoke the provider", async status => {
  const original = db.rpc.getMockImplementation()!;
  db.rpc.mockImplementation((name, args) => name === "claim_phone_auth" ? { data: { status }, error: null } : original(name, args));
  expect((await phoneVerify(request(verifyBody))).status).not.toBe(200);
  expect(checkPhoneCode).not.toHaveBeenCalled(); expect(createSessionToken).not.toHaveBeenCalled();
});
test("provider rejection is durably finished as fail and never creates a session", async () => {
  (checkPhoneCode as jest.Mock).mockResolvedValue(false);
  const original = db.rpc.getMockImplementation()!;
  db.rpc.mockImplementation((name, args) => name === "finish_phone_auth" ? { data: { status: "incorrect" }, error: null } : original(name, args));
  expect((await phoneVerify(request(verifyBody))).status).toBe(400);
  expect(db.rpc).toHaveBeenCalledWith("finish_phone_auth", expect.objectContaining({ p_outcome: "fail" }));
  expect(createSessionToken).not.toHaveBeenCalled();
});
test("login signs the durable user's id/email, not input identity, and keeps OTP private", async () => {
  const response = await phoneVerify(request({ ...verifyBody, userId: "attacker", email: "attacker@example.com" }));
  expect(response.status).toBe(200);
  expect(createSessionToken).toHaveBeenCalledWith(userId, "old@example.com");
  expect(response.cookies.get("sb-access-token")?.value).toBe("signed-session");
  expect(JSON.stringify(await response.json())).not.toContain("123456");
  expect(response.headers.get("cache-control")).toContain("no-store");
});
test("binding uses the same user id and never replaces their cookie or quotas", async () => {
  (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({ id: userId });
  const response = await phoneVerify(request({ ...verifyBody, purpose: "bind", userId: "attacker" }));
  expect(response.status).toBe(200);
  expect(db.rpc).toHaveBeenCalledWith("claim_phone_auth", expect.objectContaining({ p_user_id: userId, p_purpose: "bind" }));
  expect(createSessionToken).not.toHaveBeenCalled();
  expect(response.cookies.get("sb-access-token")).toBeUndefined();
  expect(db.rows("users")).toEqual([{ id: userId, phone: null }]);
});
test("conflict cannot mint a session or overwrite the current account", async () => {
  (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({ id: userId });
  const original = db.rpc.getMockImplementation()!;
  db.rpc.mockImplementation((name, args) => name === "finish_phone_auth" ? { data: { status: "conflict" }, error: null } : original(name, args));
  expect((await phoneVerify(request({ ...verifyBody, purpose: "bind" }))).status).toBe(409);
  expect(createSessionToken).not.toHaveBeenCalled();
});
test("anonymous callers cannot inspect binding status", async () => {
  const response = await phoneStatus(new NextRequest("https://example.com/api/auth/phone?purpose=bind"));
  expect(response.status).toBe(401);
});

test("issues browser proof before sending, and restores only this browser's masked challenge", async () => {
  const filters: unknown[][] = [];
  const row = { id: challenge, phone: "+8613800138000", created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 300_000).toISOString() };
  const query: Record<string, unknown> = {};
  for (const name of ["select","eq","in","gt","lt","order","limit","is"]) {
    query[name] = (...args: unknown[]) => { filters.push([name,...args]); return query; };
  }
  query.then = (resolve: (value: unknown) => unknown) => resolve({ data: [row], error: null });
  jest.spyOn(db, "from").mockReturnValue(query as unknown as ReturnType<FakeDb["from"]>);
  const response = await phoneStatus(new NextRequest("https://example.com/api/auth/phone?purpose=login"));
  expect(response.status).toBe(200);
  expect(response.cookies.get(phoneCookie.name)?.value).toHaveLength(43);
  expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  expect(response.headers.get("set-cookie")).toContain("SameSite=strict");
  expect(filters).toContainEqual(["is", "user_id", null]);
  const body = await response.json();
  expect(body.pending).toMatchObject({ challengeId: challenge, maskedPhone: "+86 138****8000" });
  expect(JSON.stringify(body)).not.toContain("13800138000");
});

test("no credential, OTP or raw database error reaches the client on a storage failure", async () => {
  db.rpc.mockRejectedValue(new Error("database-secret-and-phone-13800138000"));
  const response = await phoneVerify(request(verifyBody));
  expect(response.status).toBe(503);
  expect(JSON.stringify(await response.json())).not.toContain("database-secret");
  expect(createSessionToken).not.toHaveBeenCalled();
});
