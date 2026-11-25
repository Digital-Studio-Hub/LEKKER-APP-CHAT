/**
 * Huawei Push Kit downlink (Android / HMS Core, Push Kit v1).
 *
 * Credentials (names only — never commit values):
 * - HUAWEI_PUSH_APP_ID — OAuth client id / app id from AppGallery Connect
 * - HUAWEI_PUSH_APP_SECRET — matching app secret
 *
 * If either is unset, sends are skipped and the caller keeps running.
 * This is the Android HMS API (client-credentials), not the HarmonyOS
 * Push Kit v3 service-account JWT API and not the AppGallery Connect
 * publishing API.
 */

const HMS_OAUTH_URL = "https://oauth-login.cloud.huawei.com/oauth2/v3/token";

export function readHuaweiPushCredentials(
  env: NodeJS.ProcessEnv = process.env,
): { appId: string; appSecret: string } | null {
  const appId = typeof env.HUAWEI_PUSH_APP_ID === "string" ? env.HUAWEI_PUSH_APP_ID.trim() : "";
  const appSecret = typeof env.HUAWEI_PUSH_APP_SECRET === "string" ? env.HUAWEI_PUSH_APP_SECRET.trim() : "";
  if (!appId || !appSecret) return null;
  return { appId, appSecret };
}

const TOKEN_SKEW_MS = 60_000;
const DEFAULT_CHUNK = 500;

export function hmsSendUrl(appId: string): string {
  return `https://push-api.cloud.huawei.com/v1/${encodeURIComponent(appId)}/messages:send`;
}

export type HmsMessageInput = {
  tokens: string[];
  title: string;
  body: string;
  data?: Record<string, string>;
  channelId?: string;
};

export function buildHmsMessageBody(input: HmsMessageInput): Record<string, unknown> {
  const title = input.title.slice(0, 100);
  const body = input.body.slice(0, 1024);
  const dataKeys = input.data ? Object.keys(input.data) : [];
  const androidNotification: Record<string, unknown> = {
    title,
    body,
    click_action: { type: 3 },
    foreground_show: true,
    importance: "NORMAL",
    default_sound: true,
  };
  if (input.channelId) androidNotification.channel_id = input.channelId.slice(0, 64);

  const message: Record<string, unknown> = {
    notification: { title, body },
    android: { notification: androidNotification },
    token: input.tokens,
  };
  if (dataKeys.length > 0) {
    message.data = JSON.stringify(input.data);
  }

  return { validate_only: false, message };
}

/** Huawei Push Kit v1: only this code means every token in the request was accepted. */
export const HMS_SEND_SUCCESS = "80000000";

export function interpretHmsSendResponse(body: string): { ok: boolean; code: string } {
  let parsed: { code?: unknown };
  try {
    parsed = JSON.parse(body) as { code?: unknown };
  } catch {
    return { ok: false, code: "unparsed" };
  }
  const raw = parsed.code;
  const code = typeof raw === "string" ? raw : typeof raw === "number" ? String(raw) : "";
  if (!code) return { ok: false, code: "missing_code" };
  return { ok: code === HMS_SEND_SUCCESS, code };
}

export type HmsPushResult =
  | { delivered: false; reason: "not_configured" | "no_tokens" }
  | { delivered: false; reason: "oauth_failed" | "send_failed"; status?: number; code?: string }
  | { delivered: true; tokenCount: number; status: number };

type FetchResponse = {
  ok: boolean;
  status: number;
  text(): Promise<string>;
};

export type HmsFetch = (url: string, init: {
  method: string;
  headers: Record<string, string>;
  body: string;
  signal?: AbortSignal;
}) => Promise<FetchResponse>;

export type HmsPushDeps = {
  fetch?: HmsFetch;
  env?: NodeJS.ProcessEnv;
  now?: () => number;
  chunkSize?: number;
};

type TokenCache = { appId: string; accessToken: string; expiresAtMs: number };

let tokenCache: TokenCache | null = null;
let warnedMissingConfig = false;

export function resetHmsPushStateForTests(): void {
  tokenCache = null;
  warnedMissingConfig = false;
}

function warnMissingConfig(): void {
  if (warnedMissingConfig) return;
  warnedMissingConfig = true;
  console.warn(
    "[Push] HUAWEI_PUSH_APP_ID / HUAWEI_PUSH_APP_SECRET are not set; HMS tokens are stored but not delivered",
  );
}

async function fetchAccessToken(
  appId: string,
  appSecret: string,
  fetcher: HmsFetch,
  now: number,
): Promise<{ ok: true; token: string } | { ok: false; status?: number }> {
  if (tokenCache && tokenCache.appId === appId && tokenCache.expiresAtMs > now) {
    return { ok: true, token: tokenCache.accessToken };
  }

  let res: FetchResponse;
  try {
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: appId,
      client_secret: appSecret,
    });
    res = await fetcher(HMS_OAUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    console.error("[Push] HMS oauth request failed");
    return { ok: false };
  }

  const text = await res.text();
  if (!res.ok) {
    console.error("[Push] HMS oauth error:", res.status);
    return { ok: false, status: res.status };
  }

  let parsed: { access_token?: unknown; expires_in?: unknown };
  try {
    parsed = JSON.parse(text) as { access_token?: unknown; expires_in?: unknown };
  } catch {
    console.error("[Push] HMS oauth response was not JSON");
    return { ok: false, status: res.status };
  }

  if (typeof parsed.access_token !== "string" || parsed.access_token.length === 0) {
    console.error("[Push] HMS oauth response missing access_token");
    return { ok: false, status: res.status };
  }

  const expiresIn = typeof parsed.expires_in === "number" && parsed.expires_in > 120
    ? parsed.expires_in
    : 3600;
  tokenCache = {
    appId,
    accessToken: parsed.access_token,
    expiresAtMs: now + expiresIn * 1000 - TOKEN_SKEW_MS,
  };
  return { ok: true, token: parsed.access_token };
}

export async function sendHmsPush(input: HmsMessageInput, deps: HmsPushDeps = {}): Promise<HmsPushResult> {
  const tokens = input.tokens.filter((t) => typeof t === "string" && t.length > 0);
  if (tokens.length === 0) return { delivered: false, reason: "no_tokens" };

  const creds = readHuaweiPushCredentials(deps.env ?? process.env);
  if (!creds) {
    warnMissingConfig();
    return { delivered: false, reason: "not_configured" };
  }

  const fetcher = deps.fetch ?? (fetch as unknown as HmsFetch);
  const now = deps.now?.() ?? Date.now();
  const oauth = await fetchAccessToken(creds.appId, creds.appSecret, fetcher, now);
  if (!oauth.ok) return { delivered: false, reason: "oauth_failed", status: oauth.status };

  const chunkSize = deps.chunkSize && deps.chunkSize > 0 ? deps.chunkSize : DEFAULT_CHUNK;
  let lastStatus = 200;
  let sent = 0;
  for (let i = 0; i < tokens.length; i += chunkSize) {
    const chunk = tokens.slice(i, i + chunkSize);
    const payload = buildHmsMessageBody({ ...input, tokens: chunk });
    let res: FetchResponse;
    try {
      res = await fetcher(hmsSendUrl(creds.appId), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${oauth.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      console.error("[Push] HMS send request failed");
      return { delivered: false, reason: "send_failed" };
    }
    lastStatus = res.status;
    const bodyText = await res.text().catch(() => "");
    if (!res.ok) {
      console.error("[Push] HMS send error:", res.status);
      return { delivered: false, reason: "send_failed", status: res.status };
    }
    const interpreted = interpretHmsSendResponse(bodyText);
    if (!interpreted.ok) {
      console.error("[Push] HMS send rejected:", interpreted.code);
      return { delivered: false, reason: "send_failed", status: res.status, code: interpreted.code };
    }
    sent += chunk.length;
  }

  return { delivered: true, tokenCount: sent, status: lastStatus };
}
