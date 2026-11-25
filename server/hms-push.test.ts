import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHmsMessageBody,
  hmsSendUrl,
  readHuaweiPushCredentials,
  resetHmsPushStateForTests,
  sendHmsPush,
  type HmsFetch,
} from "./hms-push.ts";

const APP_ID = "test-push-app-id";
const APP_SECRET = "test-push-app-secret";

function creds(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    HUAWEI_PUSH_APP_ID: APP_ID,
    HUAWEI_PUSH_APP_SECRET: APP_SECRET,
    ...extra,
  };
}

test("credentials are absent unless both app id and secret are set", () => {
  assert.equal(readHuaweiPushCredentials({}), null);
  assert.equal(readHuaweiPushCredentials({ HUAWEI_PUSH_APP_ID: "  " }), null);
  assert.equal(readHuaweiPushCredentials({ HUAWEI_PUSH_APP_ID: APP_ID }), null);
  assert.equal(readHuaweiPushCredentials({ HUAWEI_PUSH_APP_SECRET: APP_SECRET }), null);
  assert.deepEqual(readHuaweiPushCredentials(creds()), { appId: APP_ID, appSecret: APP_SECRET });
});

test("downlink body is an Android notification that opens the app", () => {
  const body = buildHmsMessageBody({
    tokens: ["hms-1"],
    title: "Ada",
    body: "Hello",
    channelId: "messages",
    data: { chatId: "c1", type: "message" },
  });
  const message = body.message as {
    token: string[];
    data: string;
    android: { notification: { click_action: { type: number }; channel_id: string; foreground_show: boolean } };
  };
  assert.equal(body.validate_only, false);
  assert.deepEqual(message.token, ["hms-1"]);
  assert.equal(message.android.notification.click_action.type, 3);
  assert.equal(message.android.notification.channel_id, "messages");
  assert.equal(message.android.notification.foreground_show, true);
  assert.equal(JSON.parse(message.data).chatId, "c1");
  assert.equal(JSON.stringify(body).includes(APP_SECRET), false);
});

test("missing credentials skip Huawei and do not call the network", async () => {
  resetHmsPushStateForTests();
  let calls = 0;
  const fetchImpl: HmsFetch = async () => {
    calls += 1;
    throw new Error("network should not be called");
  };
  const result = await sendHmsPush(
    { tokens: ["hms-1"], title: "Hi", body: "There" },
    { fetch: fetchImpl, env: {} },
  );
  assert.deepEqual(result, { delivered: false, reason: "not_configured" });
  assert.equal(calls, 0);
});

test("configured send uses oauth then the v1 messages endpoint", async () => {
  resetHmsPushStateForTests();
  const calls: Array<{ url: string; init: { headers: Record<string, string>; body: string } }> = [];
  const fetchImpl: HmsFetch = async (url, init) => {
    calls.push({ url, init });
    if (url.includes("/oauth2/")) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ access_token: "access-1", expires_in: 3600 }),
      };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify({ code: "80000000" }) };
  };

  const result = await sendHmsPush(
    {
      tokens: ["hms-a", "hms-b"],
      title: "Lekker",
      body: "New message",
      data: { type: "message" },
      channelId: "messages",
    },
    { fetch: fetchImpl, env: creds(), chunkSize: 10 },
  );

  assert.equal(result.delivered, true);
  if (result.delivered) assert.equal(result.tokenCount, 2);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "https://oauth-login.cloud.huawei.com/oauth2/v3/token");
  assert.match(calls[0].init.body, /grant_type=client_credentials/);
  assert.match(calls[0].init.body, new RegExp(`client_id=${APP_ID}`));
  assert.match(calls[0].init.body, new RegExp(`client_secret=${APP_SECRET}`));
  assert.equal(calls[1].url, hmsSendUrl(APP_ID));
  assert.equal(calls[1].init.headers.Authorization, "Bearer access-1");
  const sent = JSON.parse(calls[1].init.body) as { message: { token: string[] } };
  assert.deepEqual(sent.message.token, ["hms-a", "hms-b"]);
  assert.equal(calls[1].init.body.includes(APP_SECRET), false);
});

test("oauth access token is reused for a second send", async () => {
  resetHmsPushStateForTests();
  let oauthCalls = 0;
  const fetchImpl: HmsFetch = async (url) => {
    if (url.includes("/oauth2/")) {
      oauthCalls += 1;
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ access_token: "access-reuse", expires_in: 3600 }),
      };
    }
    return { ok: true, status: 200, text: async () => "{}" };
  };
  const env = creds();
  const deps = { fetch: fetchImpl, env, now: () => 1_700_000_000_000 };
  await sendHmsPush({ tokens: ["hms-1"], title: "A", body: "B" }, deps);
  await sendHmsPush({ tokens: ["hms-2"], title: "A", body: "B" }, deps);
  assert.equal(oauthCalls, 1);
});

test("oauth and send failures do not throw", async () => {
  resetHmsPushStateForTests();
  const oauthFail: HmsFetch = async () => ({ ok: false, status: 401, text: async () => "nope" });
  const oauthResult = await sendHmsPush(
    { tokens: ["hms-1"], title: "A", body: "B" },
    { fetch: oauthFail, env: creds() },
  );
  assert.deepEqual(oauthResult, { delivered: false, reason: "oauth_failed", status: 401 });

  resetHmsPushStateForTests();
  const sendFail: HmsFetch = async (url) => {
    if (url.includes("/oauth2/")) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ access_token: "t", expires_in: 3600 }),
      };
    }
    return { ok: false, status: 503, text: async () => "down" };
  };
  const sendResult = await sendHmsPush(
    { tokens: ["hms-1"], title: "A", body: "B" },
    { fetch: sendFail, env: creds() },
  );
  assert.deepEqual(sendResult, { delivered: false, reason: "send_failed", status: 503 });
});

test("empty token list does not call Huawei", async () => {
  resetHmsPushStateForTests();
  let calls = 0;
  const fetchImpl: HmsFetch = async () => {
    calls += 1;
    throw new Error("no");
  };
  const result = await sendHmsPush(
    { tokens: [], title: "A", body: "B" },
    { fetch: fetchImpl, env: creds() },
  );
  assert.deepEqual(result, { delivered: false, reason: "no_tokens" });
  assert.equal(calls, 0);
});
