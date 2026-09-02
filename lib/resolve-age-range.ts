import { Platform } from "react-native";
import type { AgeRangeSource } from "@shared/age-gate";

export type ResolvedAgeRange = {
  lowerBound: number | null;
  upperBound: number | null;
  source: AgeRangeSource;
};

/** Resolve age via Apple Declared Age Range / Play Age Signals, with DOB fallback. */
export async function resolveDeviceAgeRange(
  dateOfBirthFallback?: string | null,
): Promise<ResolvedAgeRange> {
  if (Platform.OS === "ios" || Platform.OS === "android") {
    try {
      const AgeRange = await import("expo-age-range");
      try {
        const eligible = await AgeRange.isEligibleForAgeFeaturesAsync?.();
        if (eligible === false) {
          return { lowerBound: 18, upperBound: null, source: "unknown" };
        }
      } catch {
        // Treat eligibility errors as unknown — fall through to request.
      }

      const response = await AgeRange.requestAgeRangeAsync({
        threshold1: 13,
        threshold2: 18,
      });
      return {
        lowerBound: response.lowerBound ?? null,
        upperBound: response.upperBound ?? null,
        source: Platform.OS === "ios" ? "apple" : "google",
      };
    } catch (err: any) {
      const code = err?.code || "";
      if (code === "ERR_AGE_RANGE_USER_DECLINED" || code === "ERR_AGE_RANGE_NOT_AVAILABLE") {
        if (dateOfBirthFallback) {
          return { lowerBound: null, upperBound: null, source: "dob" };
        }
        return { lowerBound: null, upperBound: null, source: "unknown" };
      }
    }
  }

  if (dateOfBirthFallback) {
    return { lowerBound: null, upperBound: null, source: "dob" };
  }

  return { lowerBound: null, upperBound: null, source: "unknown" };
}