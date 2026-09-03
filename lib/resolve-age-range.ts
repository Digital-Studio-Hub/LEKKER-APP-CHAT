import type { AgeRangeSource } from "@shared/age-gate";

export type ResolvedAgeRange = {
  lowerBound: number | null;
  upperBound: number | null;
  source: AgeRangeSource;
};

/**
 * Resolve age range for App Store / Play compliance.
 * Native Declared Age Range (expo-age-range) is temporarily disabled:
 * it fails to compile on EAS Xcode 26 / Swift 6.
 * DOB / server-side age gate remains the source of truth.
 */
export async function resolveDeviceAgeRange(
  dateOfBirthFallback?: string | null,
): Promise<ResolvedAgeRange> {
  if (dateOfBirthFallback) {
    return { lowerBound: null, upperBound: null, source: "dob" };
  }
  return { lowerBound: null, upperBound: null, source: "unknown" };
}
