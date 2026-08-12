import { createSessionToken, verifySessionToken } from "./session";

describe("signed sessions", () => {
  const userId = "123e4567-e89b-42d3-a456-426614174000";

  beforeAll(() => {
    process.env.SESSION_SECRET = "test-session-secret-with-more-than-32-characters";
  });

  test("accepts an authentic signed token", async () => {
    const token = await createSessionToken(userId, "user@example.com");
    await expect(verifySessionToken(token)).resolves.toMatchObject({
      userId,
      email: "user@example.com",
      version: 2,
    });
  });

  test("rejects payload and signature tampering", async () => {
    const token = await createSessionToken(userId);
    const [payload, signature] = token.split(".");
    await expect(verifySessionToken(`${payload}x.${signature}`)).resolves.toBeNull();
    await expect(verifySessionToken(`${payload}.${signature}x`)).resolves.toBeNull();
  });

  test("rejects the legacy unsigned base64 cookie", async () => {
    const legacy = Buffer.from(JSON.stringify({ userId, exp: 4102444800 })).toString("base64");
    await expect(verifySessionToken(legacy)).resolves.toBeNull();
  });
});
