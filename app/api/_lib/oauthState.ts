import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Solves the gap flagged in Story 1.2's Dev Notes: resolveSession reads
 * x-dev-* headers, which can't survive a browser's server-initiated redirect
 * back from Google. Standard fix: carry the Firm identity through OAuth's own
 * `state` parameter, HMAC-signed so it can't be tampered with in transit.
 */
function getSecret(): string {
  const secret = process.env.OAUTH_STATE_SECRET;
  if (!secret) {
    throw new Error("OAUTH_STATE_SECRET is not set");
  }
  return secret;
}

export interface OAuthState {
  firmId: string;
}

export function signState(payload: OAuthState): string {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", getSecret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyState(state: string): OAuthState | null {
  const [encoded, signature] = state.split(".");
  if (!encoded || !signature) {
    return null;
  }

  const expected = createHmac("sha256", getSecret()).update(encoded).digest("base64url");
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}
