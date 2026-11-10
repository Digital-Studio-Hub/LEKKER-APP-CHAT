import { timingSafeEqual } from "crypto";
import jwt from "jsonwebtoken";

/**
 * X-User-Assertion for POST /api/v1/mobile/session-token.
 *
 * Format is the one LekkerNetworkV3 verifies in server/mobile-session-mint.ts
 * (Security C2, PR 52): HMAC JWT, issuer lekker-chat, audience
 * lekker-network:mobile-session, 60 second lifetime. V3 rejects a token whose
 * exp - iat is greater than 90 seconds, and rejects the assertion when the
 * signing secret is missing or equal to the mobile API key.
 */

export const MOBILE_ASSERTION_ISS = "lekker-chat";
export const MOBILE_ASSERTION_AUD = "lekker-network:mobile-session";
/** Shorter than V3's 90-second maximum so clock skew still verifies. */
export const MOBILE_ASSERTION_EXPIRES_IN = "60s";
export const MOBILE_ASSERTION_MAX_LIFETIME_SECONDS = 90;

export type VerifiedChatSessionUser = {
  /** Network user id stored on the Chat user. Never a client-supplied id. */
  lekkerNetworkId?: string | null;
  /** Phone verified by WhatsApp OTP (or the Apple Review login, which sets the same flag). */
  phone?: string | null;
  phoneVerified?: boolean | null;
};

/**
 * Same equality check V3 uses before it will accept an assertion secret.
 * True only when both values are non-empty and byte-for-byte equal.
 */
export function mobileApiKeysEqual(provided: unknown, expected: string | undefined): boolean {
  if (typeof expected !== "string" || expected.length === 0) return false;
  if (typeof provided !== "string") return false;
  const given = Buffer.from(provided, "utf8");
  const want = Buffer.from(expected, "utf8");
  if (given.length === 0 || given.length !== want.length) return false;
  return timingSafeEqual(given, want);
}

/**
 * Sign the assertion V3's readUserAssertion accepts.
 * Returns null (and logs) instead of throwing when the secret is missing,
 * blank, or the same value as the mobile API key.
 */
export function signMobileUserAssertion(input: {
  sub: string;
  phone: string;
  secret: string | undefined;
  apiKey: string | undefined;
}): string | null {
  const secret = typeof input.secret === "string" ? input.secret : "";
  const sub = typeof input.sub === "string" ? input.sub.trim() : "";
  const phone = typeof input.phone === "string" ? input.phone.trim() : "";
  // Blank or whitespace-only is missing. Otherwise sign the exact env bytes V3 verifies.
  if (secret.trim().length === 0) {
    console.warn(
      "[mobile-user-assertion] MOBILE_USER_ASSERTION_SECRET is not set; refusing to sign a mobile session assertion",
    );
    return null;
  }
  if (!sub || !phone) {
    console.warn("[mobile-user-assertion] refusing to sign: subject or phone is empty");
    return null;
  }
  if (mobileApiKeysEqual(secret, input.apiKey)) {
    console.warn(
      "[mobile-user-assertion] MOBILE_USER_ASSERTION_SECRET must not equal the mobile API key; refusing to sign",
    );
    return null;
  }
  try {
    return jwt.sign(
      { sub, phone, iss: MOBILE_ASSERTION_ISS, aud: MOBILE_ASSERTION_AUD },
      secret,
      { expiresIn: MOBILE_ASSERTION_EXPIRES_IN },
    );
  } catch {
    console.warn("[mobile-user-assertion] failed to sign a mobile session assertion; refusing to mint");
    return null;
  }
}

/**
 * Sign only for the Chat user loaded from the current session.
 * phoneVerified is set by POST /api/auth/whatsapp/verify (and the Apple Review login).
 * Password sessions do not set it. The caller must pass the database row, not request body fields.
 */
export function signAssertionForVerifiedChatUser(
  user: VerifiedChatSessionUser,
  env?: { secret: string | undefined; apiKey: string | undefined },
): string | null {
  const secret = env ? env.secret : process.env.MOBILE_USER_ASSERTION_SECRET;
  const apiKey = env ? env.apiKey : process.env.LEKKER_NETWORK_API_KEY;
  if (user.phoneVerified !== true) {
    console.warn(
      "[mobile-user-assertion] refusing to sign: current Chat session has no verified WhatsApp phone",
    );
    return null;
  }
  const sub = typeof user.lekkerNetworkId === "string" ? user.lekkerNetworkId.trim() : "";
  const phone = typeof user.phone === "string" ? user.phone.trim() : "";
  if (!sub) {
    console.warn("[mobile-user-assertion] refusing to sign: verified Chat user has no lekkerNetworkId");
    return null;
  }
  if (!phone) {
    console.warn("[mobile-user-assertion] refusing to sign: verified Chat user has no phone");
    return null;
  }
  return signMobileUserAssertion({ sub, phone, secret, apiKey });
}

/**
 * After a failed POST /api/v1/mobile/session-token that included workspace fields.
 * 401 user_auth_required is never retried. 403 not_a_member may be retried with
 * { userId } only, and the caller must send the same X-User-Assertion.
 * A 400 with no machine code is the older "unknown body field" rejection.
 */
export function shouldRetrySessionTokenAsUserIdOnly(input: {
  status: number;
  code: string | null;
  sentExtraFields: boolean;
}): boolean {
  if (!input.sentExtraFields) return false;
  if (input.status === 401 || input.code === "user_auth_required") return false;
  if (
    input.code === "user_mismatch" ||
    input.code === "phone_mismatch" ||
    input.code === "missing_api_key"
  ) {
    return false;
  }
  if (input.status === 403 && input.code === "not_a_member") return true;
  if (input.status === 400 && !input.code) return true;
  return false;
}
