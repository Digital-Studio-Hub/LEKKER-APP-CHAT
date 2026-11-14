import { apiRequest } from "@/lib/query-client";
import type { AgeRangeSource } from "@shared/age-gate";

export type SocialAccessStatus = {
  socialMediaAllowed: boolean;
  ageRangeDeclared: boolean;
  needsAgeDeclaration: boolean;
  /** Own stored date of birth (YYYY-MM-DD) when one was typed. Older servers omit these. */
  dateOfBirth?: string | null;
  ageRangeSource?: AgeRangeSource | null;
  ageVerifiedByDevice?: boolean;
  /** ISO time from which a change that keeps social access on is allowed; null = allowed now. */
  nextAgeChangeAllowedAt?: string | null;
};

export type AgeRangeErrorBody = {
  message?: string;
  code?: "INVALID_DATE_OF_BIRTH" | "INVALID_AGE_RANGE" | "AGE_VERIFIED_BY_DEVICE" | "AGE_CHANGE_COOLDOWN";
  nextAllowedAt?: string;
  nextAllowedDate?: string;
};

/** apiRequest throws `${status}: ${body}` — pull the JSON body out when there is one. */
export function parseAgeRangeError(err: unknown): AgeRangeErrorBody & { status?: number } {
  const raw = err instanceof Error ? err.message || "" : "";
  const colon = raw.indexOf(": ");
  const status = colon > 0 ? Number(raw.slice(0, colon)) : NaN;
  const bodyText = colon >= 0 ? raw.slice(colon + 2) : raw;
  try {
    const parsed = JSON.parse(bodyText);
    if (parsed && typeof parsed === "object") {
      return { ...parsed, status: Number.isFinite(status) ? status : undefined };
    }
  } catch {
    /* plain text */
  }
  return {
    message: bodyText && bodyText.length < 200 ? bodyText : "Could not save your date of birth. Try again.",
    status: Number.isFinite(status) ? status : undefined,
  };
}

export async function fetchSocialAccess(): Promise<SocialAccessStatus> {
  const res = await apiRequest("GET", "/api/user/social-access");
  const data = await res.json();
  return data;
}

export async function syncAgeRange(input: {
  lowerBound?: number | null;
  upperBound?: number | null;
  dateOfBirth?: string | null;
  source?: AgeRangeSource;
}): Promise<{
  socialMediaAllowed: boolean;
  user: Record<string, unknown>;
  unchanged?: boolean;
  nextAgeChangeAllowedAt?: string | null;
}> {
  const res = await apiRequest("POST", "/api/user/age-range", input);
  return res.json();
}