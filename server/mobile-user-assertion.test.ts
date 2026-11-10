import assert from "node:assert/strict";
import { timingSafeEqual } from "crypto";
import test from "node:test";
import jwt from "jsonwebtoken";
import {
  MOBILE_ASSERTION_AUD,
  MOBILE_ASSERTION_EXPIRES_IN,
  MOBILE_ASSERTION_ISS,
  MOBILE_ASSERTION_MAX_LIFETIME_SECONDS,
  shouldRetrySessionTokenAsUserIdOnly,
  signAssertionForVerifiedChatUser,
  signMobileUserAssertion,
} from "./mobile-user-assertion.ts";
import { fetchMobileSessionToken } from "./lekkerNetwork.ts";

/**
 * Verifier copied from LekkerNetworkV3 server/mobile-session-mint.ts
 * (PR https://github.com/Digital-Studio-Hub/LekkerNetworkV3/pull/52,
 * commit 984eea45b791b98f481a71207b57a0567e623f94).
 * Inlined so this file does not import Chat's signer constants into the check.
 * readUserAssertion, phonesMatch, assertionBindsToUser, mobileApiKeysEqual.
 */

const V3_ASSERTION_ISS = "lekker-chat";
const V3_ASSERTION_AUD = "lekker-network:mobile-session";
const V3_ASSERTION_MAX_LIFETIME_SECONDS = 90;

const API_KEY = "test-mobile-key-not-a-secret";
const ASSERTION_SECRET = "test-assertion-secret-not-the-api-key";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER = "22222222-2222-4222-8222-222222222222";
const PHONE = "+27821234567";

function v3MobileApiKeysEqual(provided: unknown, expected: string | undefined): boolean {
  if (typeof expected !== "string" || expected.length === 0) return false;
  if (typeof provided !== "string") return false;
  const given = Buffer.from(provided, "utf8");
  const want = Buffer.from(expected, "utf8");
  if (given.length === 0 || given.length !== want.length) return false;
  return timingSafeEqual(given, want);
}

function v3ReadUserAssertion(
  token: string | undefined,
  assertionSecret: string | undefined,
  apiKey: string | undefined,
): { sub: string; phone: string } | null {
  if (!token || typeof assertionSecret !== "string" || assertionSecret.length === 0) return null;
  if (v3MobileApiKeysEqual(assertionSecret, apiKey)) return null;
  try {
    const decoded = jwt.verify(token, assertionSecret, {
      issuer: V3_ASSERTION_ISS,
      audience: V3_ASSERTION_AUD,
    }) as { sub?: unknown; phone?: unknown; iat?: unknown; exp?: unknown };
    if (typeof decoded.sub !== "string" || !decoded.sub) return null;
    if (typeof decoded.phone !== "string" || !decoded.phone.trim()) return null;
    if (typeof decoded.iat !== "number" || typeof decoded.exp !== "number") return null;
    if (decoded.exp <= decoded.iat) return null;
    if (decoded.exp - decoded.iat > V3_ASSERTION_MAX_LIFETIME_SECONDS) return null;
    return { sub: decoded.sub, phone: decoded.phone.trim() };
  } catch {
    return null;
  }
}

function v3PhonesMatch(left: string | null | undefined, right: string | null | undefined): boolean {
  const a = (left ?? "").replace(/\D/g, "");
  const b = (right ?? "").replace(/\D/g, "");
  if (a.length < 9 || b.length < 9) return false;
  return a.slice(-9) === b.slice(-9);
}

function v3AssertionBindsToUser(input: {
  assertion: { sub: string; phone: string };
  requestedUserId: string;
  userMobile: string | null | undefined;
}): boolean {
  return input.assertion.sub === input.requestedUserId && v3PhonesMatch(input.assertion.phone, input.userMobile);
}

function v3AssertionVector(userId: string, phone = PHONE, expiresIn: jwt.SignOptions["expiresIn"] = "60s") {
  return jwt.sign(
    { sub: userId, phone, iss: V3_ASSERTION_ISS, aud: V3_ASSERTION_AUD },
    ASSERTION_SECRET,
    { expiresIn },
  );
}

function silenceWarn(fn: () => void): string[] {
  const warnings: string[] = [];
  const original = console.warn;
  console.warn = (msg?: unknown) => {
    warnings.push(String(msg));
  };
  try {
    fn();
  } finally {
    console.warn = original;
  }
  return warnings;
}

test("assertion constants match the V3 verifier", () => {
  assert.equal(MOBILE_ASSERTION_ISS, V3_ASSERTION_ISS);
  assert.equal(MOBILE_ASSERTION_AUD, V3_ASSERTION_AUD);
  assert.equal(MOBILE_ASSERTION_EXPIRES_IN, "60s");
  assert.equal(MOBILE_ASSERTION_MAX_LIFETIME_SECONDS, V3_ASSERTION_MAX_LIFETIME_SECONDS);
  assert.ok(60 <= V3_ASSERTION_MAX_LIFETIME_SECONDS);
});

test("a Chat assertion round-trips through V3 readUserAssertion and binds the phone", () => {
  const token = signMobileUserAssertion({
    sub: USER_ID,
    phone: PHONE,
    secret: ASSERTION_SECRET,
    apiKey: API_KEY,
  });
  assert.ok(token);
  const claims = jwt.decode(token) as { sub: string; phone: string; iss: string; aud: string; iat: number; exp: number };
  assert.equal(claims.sub, USER_ID);
  assert.equal(claims.phone, PHONE);
  assert.equal(claims.iss, "lekker-chat");
  assert.equal(claims.aud, "lekker-network:mobile-session");
  assert.equal(claims.exp - claims.iat, 60);

  const assertion = v3ReadUserAssertion(token, ASSERTION_SECRET, API_KEY);
  assert.deepEqual(assertion, { sub: USER_ID, phone: PHONE });
  assert.equal(
    v3AssertionBindsToUser({
      assertion: assertion!,
      requestedUserId: USER_ID,
      userMobile: "0821234567",
    }),
    true,
  );
  assert.equal(
    v3AssertionBindsToUser({
      assertion: assertion!,
      requestedUserId: USER_ID,
      userMobile: "+27820000000",
    }),
    false,
  );
  assert.equal(
    v3AssertionBindsToUser({
      assertion: assertion!,
      requestedUserId: OTHER_USER,
      userMobile: "0821234567",
    }),
    false,
  );

  const vector = v3AssertionVector(USER_ID);
  const fromVector = v3ReadUserAssertion(vector, ASSERTION_SECRET, API_KEY);
  const fromChat = v3ReadUserAssertion(token, ASSERTION_SECRET, API_KEY);
  assert.deepEqual(fromChat, fromVector);
});

test("V3 rejects an assertion that lives longer than 90 seconds or is signed with the API key", () => {
  const tooLong = v3AssertionVector(USER_ID, PHONE, "120s");
  assert.equal(v3ReadUserAssertion(tooLong, ASSERTION_SECRET, API_KEY), null);

  const signedWithAppKey = jwt.sign(
    { sub: USER_ID, phone: PHONE, iss: V3_ASSERTION_ISS, aud: V3_ASSERTION_AUD },
    API_KEY,
    { expiresIn: "60s" },
  );
  assert.equal(v3ReadUserAssertion(signedWithAppKey, API_KEY, API_KEY), null);

  const warnings = silenceWarn(() => {
    const refused = signMobileUserAssertion({
      sub: USER_ID,
      phone: PHONE,
      secret: API_KEY,
      apiKey: API_KEY,
    });
    assert.equal(refused, null);
  });
  assert.ok(warnings.some((line) => line.includes("must not equal the mobile API key")));
});

test("a missing assertion secret fails closed and does not throw", () => {
  for (const secret of [undefined, "", "   "]) {
    let thrown: unknown = null;
    const warnings = silenceWarn(() => {
      try {
        const token = signMobileUserAssertion({
          sub: USER_ID,
          phone: PHONE,
          secret,
          apiKey: API_KEY,
        });
        assert.equal(token, null);
      } catch (err) {
        thrown = err;
      }
    });
    assert.equal(thrown, null);
    assert.ok(warnings.some((line) => line.includes("MOBILE_USER_ASSERTION_SECRET is not set")));
    assert.ok(warnings.every((line) => !line.includes(API_KEY) && !line.includes(ASSERTION_SECRET)));
  }
});

test("only the verified Chat session user is signed, using the stored network id and phone", () => {
  const env = { secret: ASSERTION_SECRET, apiKey: API_KEY };
  const warnings = silenceWarn(() => {
    assert.equal(
      signAssertionForVerifiedChatUser(
        { lekkerNetworkId: USER_ID, phone: PHONE, phoneVerified: false },
        env,
      ),
      null,
    );
    assert.equal(
      signAssertionForVerifiedChatUser(
        { lekkerNetworkId: USER_ID, phone: PHONE, phoneVerified: null },
        env,
      ),
      null,
    );
    assert.equal(
      signAssertionForVerifiedChatUser({ lekkerNetworkId: "", phone: PHONE, phoneVerified: true }, env),
      null,
    );
    assert.equal(
      signAssertionForVerifiedChatUser({ lekkerNetworkId: USER_ID, phone: "  ", phoneVerified: true }, env),
      null,
    );
  });
  assert.ok(warnings.some((line) => line.includes("no verified WhatsApp phone")));

  const token = signAssertionForVerifiedChatUser(
    { lekkerNetworkId: USER_ID, phone: `  ${PHONE}  `, phoneVerified: true },
    env,
  );
  const assertion = v3ReadUserAssertion(token ?? undefined, ASSERTION_SECRET, API_KEY);
  assert.deepEqual(assertion, { sub: USER_ID, phone: PHONE });
  assert.notEqual(assertion?.sub, OTHER_USER);
});

test("signAssertionForVerifiedChatUser reads MOBILE_USER_ASSERTION_SECRET from the environment", () => {
  const previousSecret = process.env.MOBILE_USER_ASSERTION_SECRET;
  const previousKey = process.env.LEKKER_NETWORK_API_KEY;
  process.env.MOBILE_USER_ASSERTION_SECRET = ASSERTION_SECRET;
  process.env.LEKKER_NETWORK_API_KEY = API_KEY;
  try {
    const token = signAssertionForVerifiedChatUser({
      lekkerNetworkId: USER_ID,
      phone: PHONE,
      phoneVerified: true,
    });
    assert.deepEqual(v3ReadUserAssertion(token ?? undefined, ASSERTION_SECRET, API_KEY), {
      sub: USER_ID,
      phone: PHONE,
    });
  } finally {
    if (previousSecret === undefined) delete process.env.MOBILE_USER_ASSERTION_SECRET;
    else process.env.MOBILE_USER_ASSERTION_SECRET = previousSecret;
    if (previousKey === undefined) delete process.env.LEKKER_NETWORK_API_KEY;
    else process.env.LEKKER_NETWORK_API_KEY = previousKey;
  }

  const previous = process.env.MOBILE_USER_ASSERTION_SECRET;
  delete process.env.MOBILE_USER_ASSERTION_SECRET;
  try {
    let thrown: unknown = null;
    const warnings = silenceWarn(() => {
      try {
        assert.equal(
          signAssertionForVerifiedChatUser({
            lekkerNetworkId: USER_ID,
            phone: PHONE,
            phoneVerified: true,
          }),
          null,
        );
      } catch (err) {
        thrown = err;
      }
    });
    assert.equal(thrown, null);
    assert.ok(warnings.some((line) => line.includes("MOBILE_USER_ASSERTION_SECRET is not set")));
  } finally {
    if (previous === undefined) delete process.env.MOBILE_USER_ASSERTION_SECRET;
    else process.env.MOBILE_USER_ASSERTION_SECRET = previous;
  }
});

test("session-token retry keeps the assertion and never retries user_auth_required", () => {
  assert.equal(
    shouldRetrySessionTokenAsUserIdOnly({
      status: 401,
      code: "user_auth_required",
      sentExtraFields: true,
    }),
    false,
  );
  assert.equal(
    shouldRetrySessionTokenAsUserIdOnly({ status: 401, code: null, sentExtraFields: true }),
    false,
  );
  assert.equal(
    shouldRetrySessionTokenAsUserIdOnly({
      status: 403,
      code: "user_auth_required",
      sentExtraFields: true,
    }),
    false,
  );
  assert.equal(
    shouldRetrySessionTokenAsUserIdOnly({ status: 403, code: "phone_mismatch", sentExtraFields: true }),
    false,
  );
  assert.equal(
    shouldRetrySessionTokenAsUserIdOnly({ status: 403, code: "user_mismatch", sentExtraFields: true }),
    false,
  );
  assert.equal(
    shouldRetrySessionTokenAsUserIdOnly({ status: 403, code: "not_a_member", sentExtraFields: true }),
    true,
  );
  assert.equal(
    shouldRetrySessionTokenAsUserIdOnly({ status: 403, code: "not_a_member", sentExtraFields: false }),
    false,
  );
  assert.equal(
    shouldRetrySessionTokenAsUserIdOnly({ status: 400, code: null, sentExtraFields: true }),
    true,
  );
  assert.equal(
    shouldRetrySessionTokenAsUserIdOnly({ status: 500, code: null, sentExtraFields: true }),
    false,
  );
});

test("fetchMobileSessionToken sends X-User-Assertion and does not retry user_auth_required", async () => {
  const previousKey = process.env.LEKKER_NETWORK_API_KEY;
  process.env.LEKKER_NETWORK_API_KEY = API_KEY;
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; assertion: string | null; apiKey: string | null; body: string }> = [];
  const queue: Array<{ status: number; json: Record<string, unknown> }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push({
      url: String(input),
      assertion: headers.get("X-User-Assertion"),
      apiKey: headers.get("X-API-Key"),
      body: typeof init?.body === "string" ? init.body : "",
    });
    const next = queue.shift() ?? { status: 500, json: {} };
    return new Response(JSON.stringify(next.json), {
      status: next.status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  try {
    const assertion = signMobileUserAssertion({
      sub: USER_ID,
      phone: PHONE,
      secret: ASSERTION_SECRET,
      apiKey: API_KEY,
    });
    assert.ok(assertion);

    queue.push({ status: 200, json: { success: true, token: "handoff-token" } });
    const minted = await fetchMobileSessionToken(USER_ID, {
      workspaceId: "ws-1",
      chatProfileId: "chat-user",
      phone: PHONE,
      assertion,
    });
    assert.equal(minted, "handoff-token");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].assertion, assertion);
    assert.equal(calls[0].apiKey, API_KEY);
    assert.equal(calls[0].url.endsWith("/api/v1/mobile/session-token"), true);
    assert.equal(String(calls[0].body).includes('"workspaceId":"ws-1"'), true);

    calls.length = 0;
    queue.push({ status: 401, json: { success: false, code: "user_auth_required" } });
    const refused = await fetchMobileSessionToken(USER_ID, {
      workspaceId: "ws-1",
      phone: PHONE,
      assertion,
    });
    assert.equal(refused, null);
    assert.equal(calls.length, 1);

    calls.length = 0;
    queue.push({ status: 403, json: { success: false, code: "not_a_member" } });
    queue.push({ status: 200, json: { success: true, token: "fallback-token" } });
    const retried = await fetchMobileSessionToken(USER_ID, {
      workspaceId: "ws-1",
      chatProfileId: "chat-user",
      phone: PHONE,
      assertion,
    });
    assert.equal(retried, "fallback-token");
    assert.equal(calls.length, 2);
    assert.equal(calls[1].assertion, assertion);
    assert.deepEqual(JSON.parse(calls[1].body), { userId: USER_ID });

    calls.length = 0;
    queue.push({ status: 403, json: { success: false, code: "phone_mismatch" } });
    const mismatch = await fetchMobileSessionToken(USER_ID, {
      workspaceId: "ws-1",
      phone: PHONE,
      assertion,
    });
    assert.equal(mismatch, null);
    assert.equal(calls.length, 1);

    calls.length = 0;
    const missing = await fetchMobileSessionToken(USER_ID, {
      workspaceId: "ws-1",
      phone: PHONE,
      assertion: "   ",
    });
    assert.equal(missing, null);
    assert.equal(calls.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey === undefined) delete process.env.LEKKER_NETWORK_API_KEY;
    else process.env.LEKKER_NETWORK_API_KEY = previousKey;
  }
});
