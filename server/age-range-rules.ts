/**
 * Server rules for POST /api/user/age-range (first declaration and later changes).
 *
 * Pure functions only (no DB) so they can be unit-tested. The route loads the user,
 * calls evaluateAgeRangeRequest, and writes `update` when the result is "update".
 *
 * Rules:
 * - dateOfBirth must be a real YYYY-MM-DD calendar date, not in the future, age 0..120.
 * - lowerBound / upperBound must be whole numbers 0..120, lower <= upper.
 * - socialMediaAllowed is recalculated on every write with isSocialMediaAllowed.
 * - A typed date of birth cannot replace a device (apple / google) declaration.
 * - After an effective declaration, changes that would leave social access ON are limited
 *   to one per AGE_CHANGE_COOLDOWN_DAYS (based on age_range_declared_at). Changes that
 *   turn social access OFF are always allowed, so a child can't be held "unlocked".
 * - Submitting exactly what is already stored is a no-op (no cooldown reset).
 */
import {
  isSocialMediaAllowed,
  type AgeRangeSource,
} from "../shared/age-gate";

export const AGE_CHANGE_COOLDOWN_DAYS = 30;
export const MAX_DECLARED_AGE = 120;

const DEVICE_SOURCES: AgeRangeSource[] = ["apple", "google"];
const ALLOWED_SOURCES: AgeRangeSource[] = ["apple", "google", "dob", "unknown"];
const DAY_MS = 24 * 60 * 60 * 1000;

export type AgeRangeUserState = {
  dateOfBirth?: string | null;
  ageRangeLowerBound?: number | null;
  ageRangeUpperBound?: number | null;
  ageRangeSource?: string | null;
  ageRangeDeclaredAt?: Date | string | null;
  socialMediaAllowed?: boolean | null;
};

export type AgeRangeUpdate = {
  ageRangeLowerBound: number | null;
  ageRangeUpperBound: number | null;
  dateOfBirth?: string;
  ageRangeSource: AgeRangeSource;
  ageRangeDeclaredAt: Date;
  socialMediaAllowed: boolean;
};

export type AgeRangeErrorCode =
  | "INVALID_DATE_OF_BIRTH"
  | "INVALID_AGE_RANGE"
  | "AGE_VERIFIED_BY_DEVICE"
  | "AGE_CHANGE_COOLDOWN";

export type AgeRangeDecision =
  | { kind: "update"; update: AgeRangeUpdate; socialMediaAllowed: boolean; isChange: boolean }
  | { kind: "noop"; socialMediaAllowed: boolean }
  | {
      kind: "error";
      status: 400 | 409 | 429;
      body: {
        message: string;
        code: AgeRangeErrorCode;
        nextAllowedAt?: string;
        nextAllowedDate?: string;
      };
    };

/** Whole years between dob and `now`, using UTC calendar dates. */
export function ageOnDate(dob: { y: number; m: number; d: number }, now: Date): number {
  const ty = now.getUTCFullYear();
  const tm = now.getUTCMonth() + 1;
  const td = now.getUTCDate();
  let age = ty - dob.y;
  if (tm < dob.m || (tm === dob.m && td < dob.d)) age -= 1;
  return age;
}

export type ParsedDateOfBirth =
  | { ok: true; value: string; age: number }
  | { ok: false; message: string };

/** Strict YYYY-MM-DD; must exist on the calendar, not be in the future, and give an age 0..120. */
export function parseDateOfBirth(input: unknown, now: Date = new Date()): ParsedDateOfBirth {
  if (typeof input !== "string") {
    return { ok: false, message: "Date of birth must be a date in the format YYYY-MM-DD." };
  }
  const trimmed = input.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) {
    return { ok: false, message: "Date of birth must be a date in the format YYYY-MM-DD." };
  }
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (
    m < 1 || m > 12 || d < 1 ||
    probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d
  ) {
    return { ok: false, message: "That date doesn't exist. Use YYYY-MM-DD, e.g. 1990-04-27." };
  }
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (probe.getTime() > today) {
    return { ok: false, message: "Date of birth can't be in the future." };
  }
  const age = ageOnDate({ y, m, d }, now);
  if (age < 0 || age > MAX_DECLARED_AGE) {
    return { ok: false, message: `Age must be between 0 and ${MAX_DECLARED_AGE}.` };
  }
  return { ok: true, value: trimmed, age };
}

function parseBound(value: unknown): { ok: true; value: number | null } | { ok: false } {
  if (value === null || value === undefined || value === "") return { ok: true, value: null };
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : NaN;
  if (!Number.isInteger(n) || n < 0 || n > MAX_DECLARED_AGE) return { ok: false };
  return { ok: true, value: n };
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function isDeviceSource(source: string | null | undefined): boolean {
  return !!source && (DEVICE_SOURCES as string[]).includes(source);
}

/**
 * True when the stored declaration actually carries an age (valid typed DOB, or a device range).
 * An "unknown" declaration (no age data) or a legacy unparseable DOB is not effective, so the
 * user can correct it straight away.
 */
export function hasEffectiveDeclaration(user: AgeRangeUserState, now: Date = new Date()): boolean {
  if (!toDate(user.ageRangeDeclaredAt)) return false;
  if (isDeviceSource(user.ageRangeSource)) {
    return user.ageRangeLowerBound != null || user.ageRangeUpperBound != null;
  }
  if (user.ageRangeSource === "dob" || (!user.ageRangeSource && user.dateOfBirth)) {
    return parseDateOfBirth(user.dateOfBirth, now).ok;
  }
  return false;
}

/** When the next change that keeps social access on is allowed, or null if one is allowed now. */
export function nextAgeChangeAllowedAt(user: AgeRangeUserState, now: Date = new Date()): Date | null {
  if (!hasEffectiveDeclaration(user, now)) return null;
  const declaredAt = toDate(user.ageRangeDeclaredAt)!;
  const next = new Date(declaredAt.getTime() + AGE_CHANGE_COOLDOWN_DAYS * DAY_MS);
  return next.getTime() > now.getTime() ? next : null;
}

export function evaluateAgeRangeRequest(
  user: AgeRangeUserState,
  body: unknown,
  now: Date = new Date(),
): AgeRangeDecision {
  const { lowerBound, upperBound, dateOfBirth, source } = (body && typeof body === "object"
    ? body
    : {}) as Record<string, unknown>;

  const lower = parseBound(lowerBound);
  const upper = parseBound(upperBound);
  if (!lower.ok || !upper.ok) {
    return {
      kind: "error",
      status: 400,
      body: { message: `Age range bounds must be whole numbers from 0 to ${MAX_DECLARED_AGE}.`, code: "INVALID_AGE_RANGE" },
    };
  }
  if (lower.value != null && upper.value != null && lower.value > upper.value) {
    return {
      kind: "error",
      status: 400,
      body: { message: "lowerBound can't be greater than upperBound.", code: "INVALID_AGE_RANGE" },
    };
  }

  const hasDob = dateOfBirth !== null && dateOfBirth !== undefined;
  let dobValue: string | undefined;
  if (hasDob) {
    const parsed = parseDateOfBirth(dateOfBirth, now);
    if (!parsed.ok) {
      return { kind: "error", status: 400, body: { message: parsed.message, code: "INVALID_DATE_OF_BIRTH" } };
    }
    dobValue = parsed.value;
  }

  const ageSource: AgeRangeSource = (ALLOWED_SOURCES as unknown[]).includes(source)
    ? (source as AgeRangeSource)
    : dobValue
      ? "dob"
      : "unknown";

  const socialMediaAllowed = isSocialMediaAllowed({
    lowerBound: lower.value,
    upperBound: upper.value,
    dateOfBirth: dobValue ?? null,
  });

  const update: AgeRangeUpdate = {
    ageRangeLowerBound: lower.value,
    ageRangeUpperBound: upper.value,
    dateOfBirth: dobValue,
    ageRangeSource: ageSource,
    ageRangeDeclaredAt: now,
    socialMediaAllowed,
  };

  const isChange = !!toDate(user.ageRangeDeclaredAt);
  if (!isChange) {
    // First-ever declaration (the "Confirm your age" modal): no cooldown, no device guard.
    return { kind: "update", update, socialMediaAllowed, isChange: false };
  }

  // Typed DOB (or an empty "unknown") must not replace a device-verified range.
  if (isDeviceSource(user.ageRangeSource) && !isDeviceSource(ageSource)) {
    return {
      kind: "error",
      status: 409,
      body: {
        message:
          "Your age was confirmed by your device's age verification, so it can't be changed by typing a date of birth.",
        code: "AGE_VERIFIED_BY_DEVICE",
      },
    };
  }

  const sameAsStored =
    (user.ageRangeSource ?? null) === ageSource &&
    (user.ageRangeLowerBound ?? null) === lower.value &&
    (user.ageRangeUpperBound ?? null) === upper.value &&
    (dobValue === undefined || (user.dateOfBirth ?? null) === dobValue) &&
    (user.socialMediaAllowed ?? null) === socialMediaAllowed;
  if (sameAsStored) {
    return { kind: "noop", socialMediaAllowed };
  }

  // Changes that block social access are always allowed (safety first).
  if (socialMediaAllowed) {
    const next = nextAgeChangeAllowedAt(user, now);
    if (next) {
      const nextAllowedDate = next.toISOString().slice(0, 10);
      return {
        kind: "error",
        status: 429,
        body: {
          message: `You can change your date of birth once every ${AGE_CHANGE_COOLDOWN_DAYS} days. You can change it again from ${nextAllowedDate}.`,
          code: "AGE_CHANGE_COOLDOWN",
          nextAllowedAt: next.toISOString(),
          nextAllowedDate,
        },
      };
    }
  }

  return { kind: "update", update, socialMediaAllowed, isChange: true };
}
