/** App Store Guideline 1.2 — User-Generated Content */

export const ABUSE_CONTACT_EMAIL = "info@digitalstudiohub.com";

export const COMMUNITY_GUIDELINES_URL = "https://lekker.network/terms";

export const PRIVACY_POLICY_URL = "https://lekker.network/privacy";

/** Human support (SA) — Play Console / in-app support contact */
export const SUPPORT_PHONE_DISPLAY = "081 373 6362";
export const SUPPORT_PHONE_E164 = "+27813736362";
export const SUPPORT_WHATSAPP_URL = `https://wa.me/27813736362?text=${encodeURIComponent("Hi — I need help with Lekker Chat.")}`;

export const REPORT_REASONS = [
  { id: "spam", label: "Spam or misleading" },
  { id: "harassment", label: "Harassment or bullying" },
  { id: "hate", label: "Hate speech" },
  { id: "violence", label: "Violence or threats" },
  { id: "sexual", label: "Sexual or inappropriate content" },
  { id: "scam", label: "Scam or fraud" },
  { id: "other", label: "Other" },
] as const;

export type ReportReasonId = (typeof REPORT_REASONS)[number]["id"];