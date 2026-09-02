/**
 * Basic objectionable-content filter (App Store Guideline 1.2).
 * Blocks common profanity, slurs, and explicit terms before UGC is stored.
 */

const BLOCKED_PATTERNS: RegExp[] = [
  /\b(fuck|fucking|fucker|motherfucker)\b/i,
  /\b(shit|shitty|bullshit)\b/i,
  /\b(bitch|bastard|asshole|dickhead)\b/i,
  /\b(cunt|whore|slut)\b/i,
  /\b(nigger|nigga|kike|spic|chink|gook|wetback)\b/i,
  /\b(faggot|fag)\b/i,
  /\b(porn|porno|xxx)\b/i,
  /\b(rape|rapist)\b/i,
  /\b(kill yourself|kys)\b/i,
];

export function containsBlockedContent(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return false;
  return BLOCKED_PATTERNS.some((pattern) => pattern.test(normalized));
}

export const CONTENT_FILTER_MESSAGE =
  "This message contains language that isn't allowed under our Community Guidelines. Please revise it before sending.";