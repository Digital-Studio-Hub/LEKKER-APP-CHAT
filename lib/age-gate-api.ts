import { apiRequest } from "@/lib/query-client";
import type { AgeRangeSource } from "@shared/age-gate";

export type SocialAccessStatus = {
  socialMediaAllowed: boolean;
  ageRangeDeclared: boolean;
  needsAgeDeclaration: boolean;
};

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
}): Promise<{ socialMediaAllowed: boolean; user: Record<string, unknown> }> {
  const res = await apiRequest("POST", "/api/user/age-range", input);
  return res.json();
}