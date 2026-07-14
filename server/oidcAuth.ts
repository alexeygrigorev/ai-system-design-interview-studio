import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";

type PendingLogin = { state: string; verifier: string; nonce: string; returnTo: string };
type AuthSession = { auth?: boolean; email?: string; subject?: string; oidc?: PendingLogin };

function config() {
  const baseUrl = (process.env.AUTH_BASE_URL ?? "").replace(/\/$/, "");
  const clientId = process.env.AUTH_CLIENT_ID ?? "";
  const callbackUrl = process.env.AUTH_CALLBACK_URL ?? "";
  const issuer = process.env.AUTH_ISSUER ?? "";
  const jwksUrl = process.env.AUTH_JWKS_URL ?? (issuer ? `${issuer}/.well-known/jwks.json` : "");
  return { baseUrl, clientId, callbackUrl, issuer, jwksUrl };
}

export function oidcConfigured() {
  const value = config();
  return Boolean(value.baseUrl && value.clientId && value.callbackUrl && value.issuer && value.jwksUrl);
}

function safeReturnTo(value: unknown) {
  const path = typeof value === "string" ? value : "/";
  return path.startsWith("/") && !path.startsWith("//") ? path : "/";
}

function equal(actual: string, expected: string) {
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function beginOidcLogin(req: Request, res: Response) {
  const { baseUrl, clientId, callbackUrl } = config();
  if (!oidcConfigured()) throw new Error("Shared authentication is not configured");
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const nonce = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256").update(verifier).digest("base64url");
  (req.session as AuthSession).oidc = { state, verifier, nonce, returnTo: safeReturnTo(req.query.return_to) };

  const authorize = new URL(`${baseUrl}/oauth2/authorize`);
  authorize.search = new URLSearchParams({
    response_type: "code", client_id: clientId, redirect_uri: callbackUrl,
    scope: "openid email profile", state, nonce,
    code_challenge: codeChallenge, code_challenge_method: "S256"
  }).toString();
  res.redirect(303, authorize.toString());
}

export async function finishOidcLogin(req: Request, res: Response) {
  const { baseUrl, clientId, callbackUrl, issuer, jwksUrl } = config();
  const session = req.session as AuthSession;
  const pending = session.oidc;
  delete session.oidc;
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? req.query.state : "";
  if (!pending || !code || !state || !equal(state, pending.state)) {
    return res.status(400).send("Invalid or expired login state");
  }
  const tokenResponse = await fetch(`${baseUrl}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", client_id: clientId,
      code, redirect_uri: callbackUrl, code_verifier: pending.verifier })
  });
  if (!tokenResponse.ok) return res.status(401).send("Login code exchange failed");
  const tokens = (await tokenResponse.json()) as { id_token?: string };
  if (!tokens.id_token) return res.status(401).send("Identity token missing");
  const verified = await jwtVerify(tokens.id_token, createRemoteJWKSet(new URL(jwksUrl)), {
    issuer, audience: clientId, algorithms: ["RS256"]
  });
  if (typeof verified.payload.nonce !== "string" || !equal(verified.payload.nonce, pending.nonce)) {
    return res.status(401).send("Identity token nonce mismatch");
  }
  if (typeof verified.payload.email !== "string" || verified.payload.email_verified !== true) {
    return res.status(401).send("A verified email address is required");
  }
  session.auth = true;
  session.email = verified.payload.email.toLowerCase();
  session.subject = verified.payload.sub;
  res.redirect(303, pending.returnTo);
}

export function oidcLogoutUrl() {
  const { baseUrl, clientId } = config();
  const logoutUri = process.env.AUTH_LOGOUT_URL ?? "";
  if (!baseUrl || !clientId || !logoutUri) return "/login";
  const url = new URL(`${baseUrl}/logout`);
  url.search = new URLSearchParams({ client_id: clientId, logout_uri: logoutUri }).toString();
  return url.toString();
}
