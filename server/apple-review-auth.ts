import { normaliseMobile } from "../shared/mobile-utils";

export type AppleReviewConfig = {
  phone: string;
  code: string;
  displayName: string;
};

export function getAppleReviewConfig(): AppleReviewConfig | null {
  const rawPhone = process.env.APPLE_REVIEW_PHONE?.trim();
  const code = process.env.APPLE_REVIEW_CODE?.trim();
  if (!rawPhone || !code) return null;

  const phone = normaliseMobile(rawPhone);
  if (!phone) return null;

  return {
    phone,
    code,
    displayName: process.env.APPLE_REVIEW_DISPLAY_NAME?.trim() || "Apple Reviewer",
  };
}

export function isAppleReviewEnabled(): boolean {
  return getAppleReviewConfig() !== null;
}

export function isAppleReviewPhone(rawPhone: string): boolean {
  const config = getAppleReviewConfig();
  if (!config) return false;
  const phone = normaliseMobile(rawPhone);
  return phone === config.phone;
}

export function isAppleReviewLogin(rawPhone: string, submittedCode: string): boolean {
  const config = getAppleReviewConfig();
  if (!config) return false;
  const phone = normaliseMobile(rawPhone);
  if (phone !== config.phone) return false;
  return String(submittedCode).trim() === config.code;
}