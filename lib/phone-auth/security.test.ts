import { isSameOriginRequest } from "./security";
afterEach(() => jest.restoreAllMocks());
function request(origin: string, host?: string, site = "same-origin") {
  return new Request("http://localhost:3116/api/auth/phone/send", { headers: {
    "Content-Type":"application/json", Origin:origin, "Sec-Fetch-Site":site, ...(host ? { Host:host } : {}),
  } });
}
test("supports the original host behind Next's internal reverse-proxy URL", () => {
  expect(isSameOriginRequest(request("http://127.0.0.1:3116","127.0.0.1:3116"))).toBe(true);
});
test("requires HTTPS in production even if the internal proxy URL is HTTP", () => {
  jest.replaceProperty(process,"env",{...process.env,NODE_ENV:"production"});
  expect(isSameOriginRequest(request("https://www.ai-job-coach.xin","www.ai-job-coach.xin"))).toBe(true);
  expect(isSameOriginRequest(request("http://www.ai-job-coach.xin","www.ai-job-coach.xin"))).toBe(false);
});
test("still rejects cross-site, missing Origin, wrong host and non-JSON", () => {
  expect(isSameOriginRequest(request("https://evil.example","www.ai-job-coach.xin"))).toBe(false);
  expect(isSameOriginRequest(request("http://localhost:3116",undefined,"cross-site"))).toBe(false);
  expect(isSameOriginRequest(request("", "localhost:3116"))).toBe(false);
  expect(isSameOriginRequest(new Request("http://localhost:3116",{headers:{Origin:"http://localhost:3116"}}))).toBe(false);
});
