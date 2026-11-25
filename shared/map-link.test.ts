import assert from "node:assert/strict";
import test from "node:test";
import { locationOpenTarget } from "./map-link.ts";

test("android opens a geo URI and not a Google Maps URL", () => {
  const target = locationOpenTarget("android", "-26.2041", "28.0473");
  assert.ok(target);
  assert.equal(target.kind, "uri");
  assert.equal(target.url, "geo:-26.2041,28.0473?q=-26.2041,28.0473");
  assert.equal(target.url.includes("google"), false);
});

test("ios uses the Apple Maps scheme", () => {
  const target = locationOpenTarget("ios", -33.9249, 18.4241);
  assert.ok(target);
  assert.equal(target.url, "maps:0,0?q=-33.9249,18.4241");
  assert.equal(target.url.includes("google"), false);
});

test("web and other platforms use OpenStreetMap", () => {
  for (const platform of ["web", "windows", "macos"]) {
    const target = locationOpenTarget(platform, "1.5", "2.5");
    assert.ok(target);
    assert.equal(target.kind, "web");
    assert.match(target.url, /^https:\/\/www\.openstreetmap\.org\//);
    assert.equal(target.url.includes("google"), false);
    assert.equal(target.url.includes("maps.google"), false);
  }
});

test("invalid coordinates do not produce a link", () => {
  assert.equal(locationOpenTarget("android", "", "1"), null);
  assert.equal(locationOpenTarget("android", "nope", "1"), null);
  assert.equal(locationOpenTarget("web", 91, 0), null);
  assert.equal(locationOpenTarget("ios", 0, 181), null);
});
