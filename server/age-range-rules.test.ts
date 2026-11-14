import assert from "node:assert/strict";
import test from "node:test";
import {
  AGE_CHANGE_COOLDOWN_DAYS,
  evaluateAgeRangeRequest,
  nextAgeChangeAllowedAt,
  parseDateOfBirth,
  type AgeRangeUserState,
} from "./age-range-rules";

const NOW = new Date("2026-11-14T02:31:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);

const NEW_USER: AgeRangeUserState = {
  dateOfBirth: null,
  ageRangeLowerBound: null,
  ageRangeUpperBound: null,
  ageRangeSource: null,
  ageRangeDeclaredAt: null,
  socialMediaAllowed: null,
};

function dobUser(dateOfBirth: string, declaredDaysAgo: number, allowed: boolean): AgeRangeUserState {
  return {
    dateOfBirth,
    ageRangeLowerBound: null,
    ageRangeUpperBound: null,
    ageRangeSource: "dob",
    ageRangeDeclaredAt: daysAgo(declaredDaysAgo),
    socialMediaAllowed: allowed,
  };
}

// --- validation ---------------------------------------------------------------

test("parseDateOfBirth accepts a real past date and returns the age", () => {
  const r = parseDateOfBirth("1990-04-27", NOW);
  assert.deepEqual(r, { ok: true, value: "1990-04-27", age: 36 });
  // Birthday tomorrow: still 12, not 13
  const r2 = parseDateOfBirth("2013-11-15", NOW);
  assert.equal(r2.ok && r2.age, 12);
  const r3 = parseDateOfBirth("2013-11-14", NOW);
  assert.equal(r3.ok && r3.age, 13);
});

test("parseDateOfBirth rejects garbage, impossible dates, future dates and ages over 120", () => {
  for (const bad of ["", "hello", "1990/04/27", "27-04-1990", "1990-4-7", "1990-02-30", "2023-13-01", "2026-11-15", "1905-01-01", 19900427, null, {}]) {
    assert.equal(parseDateOfBirth(bad as unknown, NOW).ok, false, `expected reject for ${JSON.stringify(bad)}`);
  }
  assert.equal(parseDateOfBirth("2026-11-14", NOW).ok, true); // born today = age 0
  assert.equal(parseDateOfBirth("1906-11-14", NOW).ok, true); // exactly 120
});

test("garbage date of birth gets a 400, on first declaration and on change", () => {
  for (const user of [NEW_USER, dobUser("1990-04-27", 90, true)]) {
    const d = evaluateAgeRangeRequest(user, { dateOfBirth: "not-a-date", source: "dob" }, NOW);
    assert.equal(d.kind, "error");
    assert.equal(d.kind === "error" && d.status, 400);
    assert.equal(d.kind === "error" && d.body.code, "INVALID_DATE_OF_BIRTH");
  }
  const future = evaluateAgeRangeRequest(NEW_USER, { dateOfBirth: "2030-01-01" }, NOW);
  assert.equal(future.kind === "error" && future.status, 400);
});

test("out-of-range or inverted age bounds get a 400", () => {
  for (const body of [{ lowerBound: -1 }, { lowerBound: 200 }, { lowerBound: "abc" }, { lowerBound: 12.5 }, { lowerBound: 18, upperBound: 13 }]) {
    const d = evaluateAgeRangeRequest(NEW_USER, { ...body, source: "apple" }, NOW);
    assert.equal(d.kind === "error" && d.status, 400, JSON.stringify(body));
    assert.equal(d.kind === "error" && d.body.code, "INVALID_AGE_RANGE");
  }
});

// --- first declaration (existing modal) unchanged ----------------------------------

test("first declaration: adult DOB is saved and allowed, no cooldown", () => {
  const d = evaluateAgeRangeRequest(NEW_USER, { dateOfBirth: "1990-04-27", source: "dob" }, NOW);
  assert.equal(d.kind, "update");
  if (d.kind !== "update") return;
  assert.equal(d.isChange, false);
  assert.equal(d.socialMediaAllowed, true);
  assert.equal(d.update.socialMediaAllowed, true);
  assert.equal(d.update.dateOfBirth, "1990-04-27");
  assert.equal(d.update.ageRangeSource, "dob");
  assert.equal(d.update.ageRangeDeclaredAt.getTime(), NOW.getTime());
});

test("first declaration: under-13 DOB is saved and blocked", () => {
  const d = evaluateAgeRangeRequest(NEW_USER, { dateOfBirth: "2016-03-01", source: "dob" }, NOW);
  assert.equal(d.kind === "update" && d.socialMediaAllowed, false);
});

test("first declaration: device range and empty 'unknown' still work", () => {
  const dev = evaluateAgeRangeRequest(NEW_USER, { lowerBound: 18, upperBound: null, source: "apple" }, NOW);
  assert.equal(dev.kind === "update" && dev.socialMediaAllowed, true);
  const unknown = evaluateAgeRangeRequest(NEW_USER, { lowerBound: null, upperBound: null, source: "unknown" }, NOW);
  assert.equal(unknown.kind === "update" && unknown.socialMediaAllowed, false);
});

// --- changes: recalculation -----------------------------------------------------

test("change to an under-13 DOB blocks access immediately, even inside the cooldown", () => {
  const user = dobUser("1990-04-27", 1, true);
  const d = evaluateAgeRangeRequest(user, { dateOfBirth: "2015-06-01", source: "dob" }, NOW);
  assert.equal(d.kind, "update");
  assert.equal(d.kind === "update" && d.socialMediaAllowed, false);
  assert.equal(d.kind === "update" && d.update.socialMediaAllowed, false);
});

test("change from a blocked under-13 DOB to an adult DOB is allowed after the cooldown", () => {
  const user = dobUser("2015-06-01", AGE_CHANGE_COOLDOWN_DAYS + 1, false);
  const d = evaluateAgeRangeRequest(user, { dateOfBirth: "1990-04-27", source: "dob" }, NOW);
  assert.equal(d.kind, "update");
  assert.equal(d.kind === "update" && d.isChange, true);
  assert.equal(d.kind === "update" && d.update.socialMediaAllowed, true);
});

test("adult correcting to another adult DOB after the cooldown stays allowed", () => {
  const user = dobUser("1990-04-27", 45, true);
  const d = evaluateAgeRangeRequest(user, { dateOfBirth: "1985-01-15", source: "dob" }, NOW);
  assert.equal(d.kind === "update" && d.socialMediaAllowed, true);
  assert.equal(d.kind === "update" && d.update.dateOfBirth, "1985-01-15");
});

// --- cooldown ---------------------------------------------------------------------

test("blocked child retrying an older DOB inside the cooldown gets 429 with the next date", () => {
  const user = dobUser("2015-06-01", 3, false);
  const d = evaluateAgeRangeRequest(user, { dateOfBirth: "2000-01-01", source: "dob" }, NOW);
  assert.equal(d.kind, "error");
  if (d.kind !== "error") return;
  assert.equal(d.status, 429);
  assert.equal(d.body.code, "AGE_CHANGE_COOLDOWN");
  const expected = new Date(daysAgo(3).getTime() + AGE_CHANGE_COOLDOWN_DAYS * DAY);
  assert.equal(d.body.nextAllowedAt, expected.toISOString());
  assert.equal(d.body.nextAllowedDate, "2026-12-11");
  assert.match(d.body.message, /2026-12-11/);
});

test("cooldown also covers a client claiming a device source to unlock", () => {
  const user = dobUser("2015-06-01", 3, false);
  const d = evaluateAgeRangeRequest(user, { lowerBound: 18, source: "google" }, NOW);
  assert.equal(d.kind === "error" && d.status, 429);
});

test("adult changing DOB twice within the cooldown gets 429", () => {
  const user = dobUser("1990-04-27", 10, true);
  const d = evaluateAgeRangeRequest(user, { dateOfBirth: "1991-04-27", source: "dob" }, NOW);
  assert.equal(d.kind === "error" && d.status, 429);
});

test("no cooldown when the stored declaration had no real age ('unknown' or legacy garbage DOB)", () => {
  const unknown: AgeRangeUserState = { ...NEW_USER, ageRangeSource: "unknown", ageRangeDeclaredAt: daysAgo(1), socialMediaAllowed: false };
  const d1 = evaluateAgeRangeRequest(unknown, { dateOfBirth: "1990-04-27", source: "dob" }, NOW);
  assert.equal(d1.kind === "update" && d1.socialMediaAllowed, true);
  const legacy = dobUser("garbage", 1, false);
  const d2 = evaluateAgeRangeRequest(legacy, { dateOfBirth: "1990-04-27", source: "dob" }, NOW);
  assert.equal(d2.kind === "update" && d2.socialMediaAllowed, true);
  assert.equal(nextAgeChangeAllowedAt(unknown, NOW), null);
});

test("re-submitting the stored DOB is a no-op and does not reset the cooldown", () => {
  const user = dobUser("1990-04-27", 2, true);
  const d = evaluateAgeRangeRequest(user, { dateOfBirth: "1990-04-27", source: "dob" }, NOW);
  assert.equal(d.kind, "noop");
});

test("nextAgeChangeAllowedAt is null once the cooldown has passed", () => {
  assert.equal(nextAgeChangeAllowedAt(dobUser("1990-04-27", AGE_CHANGE_COOLDOWN_DAYS, true), NOW), null);
  assert.ok(nextAgeChangeAllowedAt(dobUser("1990-04-27", AGE_CHANGE_COOLDOWN_DAYS - 1, true), NOW));
});

// --- device-source guard --------------------------------------------------------------

test("typed DOB can't override a device (apple/google) declaration", () => {
  for (const src of ["apple", "google"]) {
    const user: AgeRangeUserState = {
      dateOfBirth: null,
      ageRangeLowerBound: 0,
      ageRangeUpperBound: 12,
      ageRangeSource: src,
      ageRangeDeclaredAt: daysAgo(400),
      socialMediaAllowed: false,
    };
    const d = evaluateAgeRangeRequest(user, { dateOfBirth: "1990-04-27", source: "dob" }, NOW);
    assert.equal(d.kind, "error");
    assert.equal(d.kind === "error" && d.status, 409);
    assert.equal(d.kind === "error" && d.body.code, "AGE_VERIFIED_BY_DEVICE");
    // Omitting source still counts as a typed DOB
    const d2 = evaluateAgeRangeRequest(user, { dateOfBirth: "1990-04-27" }, NOW);
    assert.equal(d2.kind === "error" && d2.body.code, "AGE_VERIFIED_BY_DEVICE");
  }
});
