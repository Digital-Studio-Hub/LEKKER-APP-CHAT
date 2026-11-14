import assert from "node:assert/strict";
import { test } from "node:test";
import { legalRedirectTarget, legalRedirects } from "./legal-redirects";

test("legal paths map to lekker.network", () => {
  assert.equal(legalRedirectTarget("/terms"), "https://lekker.network/terms");
  assert.equal(legalRedirectTarget("/terms/"), "https://lekker.network/terms");
  assert.equal(legalRedirectTarget("/Terms-And-Conditions"), "https://lekker.network/terms");
  assert.equal(legalRedirectTarget("/privacy"), "https://lekker.network/privacy");
  assert.equal(legalRedirectTarget("/privacy-policy/"), "https://lekker.network/privacy");
  assert.equal(legalRedirectTarget("/terms/extra"), null);
  assert.equal(legalRedirectTarget("/api/privacy"), null);
  assert.equal(legalRedirectTarget("/"), null);
});

function run(mw: ReturnType<typeof legalRedirects>, method: string, path: string, host = "example.com") {
  const out: { status?: number; location?: string; next: boolean } = { next: false };
  const req = { method, path, get: (h: string) => (h.toLowerCase() === "host" ? host : undefined) } as any;
  const res = {
    setHeader() {},
    redirect(status: number, location: string) { out.status = status; out.location = location; },
  } as any;
  mw(req, res, () => { out.next = true; });
  return out;
}

test("middleware sends 301 for GET and HEAD only", () => {
  const mw = legalRedirects();
  assert.deepEqual(run(mw, "GET", "/privacy"), { status: 301, location: "https://lekker.network/privacy", next: false });
  assert.equal(run(mw, "HEAD", "/terms").status, 301);
  assert.equal(run(mw, "POST", "/terms").next, true);
  assert.equal(run(mw, "GET", "/about").next, true);
});

test("host filter limits redirects", () => {
  const mw = legalRedirects({ hostAllowed: (h) => h === "lekker.website" });
  assert.equal(run(mw, "GET", "/terms", "lekker.website:443").status, 301);
  assert.equal(run(mw, "GET", "/terms", "client.co.za").next, true);
});
