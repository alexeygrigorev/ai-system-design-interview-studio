import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

test("OIDC login uses PKCE and creates a local session after a verified callback", async () => {
  process.env.AUTH_BASE_URL = "https://auth.example.test";
  process.env.AUTH_CLIENT_ID = "studio-client";
  process.env.AUTH_ISSUER = "https://issuer.example.test/pool";
  process.env.AUTH_JWKS_URL = "https://issuer.example.test/pool/.well-known/jwks.json";
  process.env.AUTH_LOGOUT_URL = "https://studio.example.test/";
  process.env.SESSION_SECRET = "test-session-secret";
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "test-key", use: "sig", alg: "RS256" };
  let nonce = "";

  const originalFetch = global.fetch;
  global.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith("/.well-known/jwks.json")) {
      return new Response(JSON.stringify({ keys: [jwk] }), { headers: { "content-type": "application/json" } });
    }
    if (url.endsWith("/oauth2/token")) {
      const token = await new SignJWT({ email: "person@datatalks.club", email_verified: true, nonce })
        .setProtectedHeader({ alg: "RS256", kid: "test-key" })
        .setIssuer(process.env.AUTH_ISSUER!)
        .setAudience("studio-client")
        .setSubject("person-1")
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(privateKey);
      return new Response(JSON.stringify({ id_token: token }), { headers: { "content-type": "application/json" } });
    }
    throw new Error(`Unexpected fetch ${url}`);
  }) as typeof fetch;

  const { createApp } = await import("./app.js");
  const server = createServer(createApp(process.cwd()));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;
    process.env.AUTH_CALLBACK_URL = `${base}/auth/callback`;
    const login = await originalFetch(`${base}/login?return_to=%2Freviews`, { redirect: "manual" });
    assert.equal(login.status, 303);
    const authorize = new URL(login.headers.get("location")!);
    assert.equal(authorize.pathname, "/oauth2/authorize");
    assert.equal(authorize.searchParams.get("code_challenge_method"), "S256");
    assert.ok(authorize.searchParams.get("code_challenge"));
    nonce = authorize.searchParams.get("nonce")!;
    const cookies = login.headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; ");
    const callback = await originalFetch(
      `${base}/auth/callback?code=valid-code&state=${encodeURIComponent(authorize.searchParams.get("state")!)}`,
      { headers: { cookie: cookies }, redirect: "manual" }
    );
    assert.equal(callback.status, 303);
    assert.equal(callback.headers.get("location"), "/reviews");
    assert.match(callback.headers.get("set-cookie") || "", /studio_session=/);
  } finally {
    global.fetch = originalFetch;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("invalid OIDC state redirects to a clean error URL", async () => {
  process.env.AUTH_BASE_URL = "https://auth.example.test";
  process.env.AUTH_CLIENT_ID = "studio-client";
  process.env.AUTH_ISSUER = "https://issuer.example.test/pool";
  process.env.AUTH_JWKS_URL = "https://issuer.example.test/jwks";
  process.env.AUTH_CALLBACK_URL = "https://studio.example.test/auth/callback";
  const { createApp } = await import("./app.js");
  const server = createServer(createApp(process.cwd()));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert(address && typeof address !== "string");
    const response = await fetch(`http://127.0.0.1:${address.port}/auth/callback?code=secret&state=secret`, { redirect: "manual" });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), "/auth/error");
    assert.equal(response.headers.get("cache-control"), "no-store");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
