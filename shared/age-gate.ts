/** App Store / Play age-assurance — social media access (UGC feed, public social browse). */

export const SOCIAL_MEDIA_MIN_AGE = 13;

export type AgeRangeSource = "apple" | "google" | "dob" | "unknown";

export function ageFromDateOfBirth(dateOfBirth: string): number | null {
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDelta = today.getMonth() - dob.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age >= 0 && age <= 120 ? age : null;
}

/** True when the user may use social-media features (feed, public social UGC). */
export function isSocialMediaAllowed(input: {
  lowerBound?: number | null;
  upperBound?: number | null;
  dateOfBirth?: string | null;
  socialMediaAllowed?: boolean | null;
}): boolean {
  if (input.socialMediaAllowed === true) return true;
  if (input.socialMediaAllowed === false) return false;

  if (input.lowerBound != null) {
    return input.lowerBound >= SOCIAL_MEDIA_MIN_AGE;
  }

  if (input.dateOfBirth) {
    const age = ageFromDateOfBirth(input.dateOfBirth);
    if (age != null) return age >= SOCIAL_MEDIA_MIN_AGE;
  }

  return false;
}

export function socialAccessFromAgeRange(lowerBound: number | null, upperBound: number | null): boolean {
  return isSocialMediaAllowed({ lowerBound, upperBound });
}