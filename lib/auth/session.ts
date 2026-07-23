import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { verifyMessage } from "viem";

// Wallet-signature auth. No passwords, no email: the wallet that signs is the identity, and the
// wallet that created a launchpad owns it.
//
// STATELESS BY NECESSITY. On serverless there is no shared memory between invocations, so a nonce
// held in a module-level Map would be issued by one instance and unknown to the next. Both the
// nonce and the session are therefore signed JWTs in httpOnly cookies — nothing to look up.

const SESSION_COOKIE = "lp_session";
const NONCE_COOKIE = "lp_nonce";
const SESSION_TTL = "7d";
const NONCE_TTL = "10m";

function secret(): Uint8Array | null {
  const s = process.env.SESSION_SECRET;
  // Fail CLOSED. A default secret would mean anyone who reads this repository can mint a session
  // for any address, which is total account takeover — better that auth is simply unavailable.
  if (!s || s.length < 32) return null;
  return new TextEncoder().encode(s);
}

export const authConfigured = Boolean(process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32);

/// The exact text the wallet signs. Human-readable (the user sees it in MetaMask) and pinned to a
/// domain + nonce so a signature harvested on another site cannot be replayed here.
export function buildSignInMessage(params: { address: string; nonce: string; domain: string; issuedAt: string }) {
  return [
    `${params.domain} wants you to sign in with your Ethereum account:`,
    params.address,
    "",
    "Sign in to manage your launchpads. This request will not trigger a transaction or cost any gas.",
    "",
    `URI: https://${params.domain}`,
    "Version: 1",
    `Nonce: ${params.nonce}`,
    `Issued At: ${params.issuedAt}`,
  ].join("\n");
}

export async function issueNonce(): Promise<{ nonce: string; issuedAt: string } | null> {
  const key = secret();
  if (!key) return null;
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const issuedAt = new Date().toISOString();
  const token = await new SignJWT({ nonce, issuedAt })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(NONCE_TTL)
    .sign(key);

  const jar = await cookies();
  jar.set(NONCE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
  });
  return { nonce, issuedAt };
}

type VerifyResult = { ok: true; address: `0x${string}` } | { ok: false; error: string };

export async function verifySignature(params: {
  address: string;
  signature: string;
  domain: string;
}): Promise<VerifyResult> {
  const key = secret();
  if (!key) return { ok: false, error: "Auth is not configured on this deployment" };
  if (!/^0x[0-9a-fA-F]{40}$/.test(params.address)) return { ok: false, error: "Invalid address" };

  const jar = await cookies();
  const nonceToken = jar.get(NONCE_COOKIE)?.value;
  if (!nonceToken) return { ok: false, error: "No sign-in challenge — request a nonce first" };

  let nonce: string;
  let issuedAt: string;
  try {
    const { payload } = await jwtVerify(nonceToken, key);
    nonce = String(payload.nonce);
    issuedAt = String(payload.issuedAt);
  } catch {
    return { ok: false, error: "Sign-in challenge expired — try again" };
  }

  const message = buildSignInMessage({ address: params.address, nonce, domain: params.domain, issuedAt });

  let valid = false;
  try {
    // verifyMessage handles both EOA (ECDSA) and, given a public client, ERC-1271 contract wallets.
    // We only pass the message here, so this covers EOAs — smart-contract wallets are a known gap
    // recorded in the phase report rather than silently half-supported.
    valid = await verifyMessage({
      address: params.address as `0x${string}`,
      message,
      signature: params.signature as `0x${string}`,
    });
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, error: "Signature does not match the address" };

  // Burn the nonce: a signature is good for exactly one sign-in.
  jar.delete(NONCE_COOKIE);

  const address = params.address.toLowerCase() as `0x${string}`;
  const session = await new SignJWT({ sub: address })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(key);

  jar.set(SESSION_COOKIE, session, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return { ok: true, address };
}

/// The address of the current session, or null. Every mutating route calls this and compares it to
/// the row's owner_address — there is no other authorisation mechanism.
export async function currentAddress(): Promise<`0x${string}` | null> {
  const key = secret();
  if (!key) return null;
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key);
    const sub = String(payload.sub ?? "");
    return /^0x[0-9a-f]{40}$/.test(sub) ? (sub as `0x${string}`) : null;
  } catch {
    return null;
  }
}

export async function signOut() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(NONCE_COOKIE);
}
