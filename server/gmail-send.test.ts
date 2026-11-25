import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";
import {
  isTransactionalEmailConfigured,
  plannedEmailProviders,
  sendTransactionalEmail,
} from "./gmail";

const MAIL_ENV = [
  "SMTP2GO_LEKKER_NETWORK_API_KEY",
  "SMTP2GO_API_KEY",
  "INBOUND_API_KEY",
  "SYSTEM_ZEPTOMAIL_API_KEY",
  "SYSTEM_FROM_EMAIL",
  "SYSTEM_FROM_NAME",
  "SYSTEM_EMAIL_PROVIDER",
] as const;

const saved: Record<string, string | undefined> = {};
let fetchCalls: { url: string; init: RequestInit }[] = [];
const originalFetch = globalThis.fetch;
const logs: { level: string; args: unknown[] }[] = [];
const originalLog = console.log;
const originalError = console.error;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  for (const name of MAIL_ENV) {
    saved[name] = process.env[name];
    delete process.env[name];
  }
  process.env.SYSTEM_FROM_EMAIL = "noreply@lekker.network";
  process.env.SYSTEM_FROM_NAME = "Lekker Chat";
  process.env.SYSTEM_EMAIL_PROVIDER = "auto";
  fetchCalls = [];
  logs.length = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    fetchCalls.push({ url, init: init || {} });
    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;
  console.log = (...args: unknown[]) => {
    logs.push({ level: "log", args });
  };
  console.error = (...args: unknown[]) => {
    logs.push({ level: "error", args });
  };
});

afterEach(() => {
  for (const name of MAIL_ENV) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
  globalThis.fetch = originalFetch;
  console.log = originalLog;
  console.error = originalError;
});

function logText(): string {
  return logs.map((entry) => entry.args.map(String).join(" ")).join("\n");
}

function headerNames(init: RequestInit): string[] {
  const headers = init.headers;
  if (!headers) return [];
  if (headers instanceof Headers) return [...headers.keys()];
  if (Array.isArray(headers)) return headers.map(([name]) => name);
  return Object.keys(headers);
}

test("auto prefers SMTP2GO and falls back to inbound when SMTP2GO is not configured", () => {
  process.env.INBOUND_API_KEY = "inbound-test-key";
  assert.deepEqual(plannedEmailProviders(), ["inbound"]);
  assert.equal(isTransactionalEmailConfigured(), true);

  process.env.SMTP2GO_LEKKER_NETWORK_API_KEY = "smtp-test-key";
  assert.deepEqual(plannedEmailProviders(), ["smtp2go", "inbound"]);
});

test("SMTP2GO send logs success per recipient and does not call inbound", async () => {
  process.env.SMTP2GO_LEKKER_NETWORK_API_KEY = "smtp-test-key";
  process.env.INBOUND_API_KEY = "inbound-test-key";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    fetchCalls.push({ url, init: init || {} });
    assert.equal(url, "https://api.smtp2go.com/v3/email/send");
    const body = JSON.parse(String(init?.body || "{}"));
    assert.equal(body.sender, "Lekker Chat <noreply@lekker.network>");
    assert.deepEqual(body.to, ["warren@digitalstudiohub.com", "info@digitalstudiohub.com"]);
    assert.equal(body.subject, "Review this");
    assert.equal(body.html_body, "<p>hi</p>");
    assert.equal(body.text_body, "hi");
    assert.equal(body.api_key, undefined);
    const names = headerNames(init || {});
    assert.ok(names.some((name) => name.toLowerCase() === "x-smtp2go-api-key"));
    return jsonResponse({ data: { email_id: "email-123", succeeded: 2, failed: 0 } });
  }) as typeof fetch;

  const ok = await sendTransactionalEmail(
    ["warren@digitalstudiohub.com", "info@digitalstudiohub.com"],
    "Review this",
    "<p>hi</p>",
    "hi",
  );
  assert.equal(ok, true);
  assert.equal(fetchCalls.length, 1);
  const text = logText();
  assert.match(text, /smtp2go success to warren@digitalstudiohub.com: Review this/);
  assert.match(text, /smtp2go success to info@digitalstudiohub.com: Review this/);
  assert.equal(text.includes("inbound"), false);
});

test("SMTP2GO failure falls back to inbound and logs each attempt", async () => {
  process.env.SMTP2GO_API_KEY = "smtp-test-key";
  process.env.INBOUND_API_KEY = "inbound-test-key";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    fetchCalls.push({ url, init: init || {} });
    if (url.includes("api.smtp2go.com")) {
      return jsonResponse({ data: { error: "sender not allowed", error_code: "E_DENIED" } }, 400);
    }
    if (url.includes("inbound.new")) {
      return jsonResponse({ id: "inb-1" }, 200);
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  const ok = await sendTransactionalEmail("info@digitalstudiohub.com", "Alert", "<p>x</p>", "x");
  assert.equal(ok, true);
  assert.equal(fetchCalls.length, 2);
  const text = logText();
  assert.match(text, /smtp2go failure to info@digitalstudiohub.com:.*sender not allowed/);
  assert.match(text, /inbound success to info@digitalstudiohub.com: Alert/);
});

test("inbound-only when SMTP2GO is not configured", async () => {
  process.env.INBOUND_API_KEY = "inbound-test-key";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    fetchCalls.push({ url, init: init || {} });
    assert.ok(url.includes("inbound.new"));
    return new Response("nope", { status: 500 });
  }) as typeof fetch;

  const ok = await sendTransactionalEmail("warren@digitalstudiohub.com", "Alert", "<p>x</p>", "x");
  assert.equal(ok, false);
  assert.equal(fetchCalls.length, 1);
  assert.match(logText(), /inbound failure to warren@digitalstudiohub.com: Lekker Mail send failed: 500/);
});
