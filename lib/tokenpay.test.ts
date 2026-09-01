jest.mock("./db", () => ({ getDbClient: jest.fn() }));

import {
  buildTokenPayAuthorizeUrl,
  createPkcePair,
  decryptTokenPayKey,
  encryptTokenPayKey,
  fingerprintTokenPayKey,
  microyuanToYuan,
} from "./tokenpay";

describe("TokenPay security primitives", () => {
  const previousKey = process.env.TOKENPAY_ENCRYPTION_KEY;

  beforeAll(() => {
    process.env.TOKENPAY_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  });

  afterAll(() => {
    if (previousKey === undefined) delete process.env.TOKENPAY_ENCRYPTION_KEY;
    else process.env.TOKENPAY_ENCRYPTION_KEY = previousKey;
  });

  it("creates an S256-compatible PKCE pair", () => {
    const pair = createPkcePair();
    expect(pair.verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    expect(pair.challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(pair.challenge).not.toBe(pair.verifier);
  });

  it("builds an OAuth URL with S256 PKCE and app attribution", () => {
    const url = new URL(buildTokenPayAuthorizeUrl({
      callbackUrl: "https://www.ai-job-coach.xin/api/tokenpay/callback?state=state-1",
      challenge: "challenge-1",
    }));
    expect(url.origin).toBe("https://tokendance.space");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe("challenge-1");
    expect(url.searchParams.get("callback_url")).toContain("/api/tokenpay/callback");
    expect(url.searchParams.get("app_url")).toBe("https://www.ai-job-coach.xin");
  });

  it("encrypts API keys without exposing plaintext", () => {
    const apiKey = "td-secret-api-key";
    const encrypted = encryptTokenPayKey(apiKey);
    expect(encrypted).toMatch(/^v1\./);
    expect(encrypted).not.toContain(apiKey);
    expect(decryptTokenPayKey(encrypted)).toBe(apiKey);
    expect(fingerprintTokenPayKey(apiKey)).toHaveLength(12);
  });

  it("converts microyuan to yuan", () => {
    expect(microyuanToYuan(12_340_000)).toBe(12.34);
  });
});
