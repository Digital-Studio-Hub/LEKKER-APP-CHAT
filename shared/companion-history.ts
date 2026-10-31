/**
 * Companion-mode chat history and family-alert rules.
 *
 * The model may only see this user's companion conversation. Other Cledwyn
 * threads (workspace / generalist) and check-in, family-alert, or notification
 * lines are dropped. The saved family contact name is resolved from that
 * user's record alone — never from chat text.
 *
 * Lekker Network V3 accepts an optional `familyContactName: string | null`
 * on POST /api/v1/cledwyn/chat. Older V3 builds ignore the field.
 */

export const COMPANION_CHAT_SOURCE = "companion-chat" as const;

/** Separate V3 session from workspace / generalist Cledwyn so those threads cannot continue here. */
export function companionSessionStorageKey(profileSessionKey: string): string {
  return `${profileSessionKey}:companion`;
}

/** Turns forwarded to the companion model (after filtering). */
export const COMPANION_HISTORY_LIMIT = 12;

export const EMERGENCY_ALERT_MIN_GAP_MS = 2 * 60 * 1000;
export const EMERGENCY_ALERT_HOUR_MS = 60 * 60 * 1000;
export const EMERGENCY_ALERT_HOURLY_CAP = 5;

export const COMPANION_REQUIRED_MESSAGE =
  "Companion mode is off. Turn it on in Personal Settings before alerting your family.";
export const NO_FAMILY_CONTACT_MESSAGE =
  "No family contact is saved. Add one in Personal Settings, then try again.";
export const MISSING_FAMILY_CONTACT_MESSAGE =
  "That family contact is no longer on Lekker Chat. Choose them again in Personal Settings.";
export const EMERGENCY_ALERT_GAP_MESSAGE =
  "Please wait a couple of minutes before alerting your family again.";
export const EMERGENCY_ALERT_HOURLY_MESSAGE =
  "You’ve reached the limit for family alerts this hour. Please wait a bit and try again.";

/** Server event types that are check-ins, alerts, or other system lines. */
export const COMPANION_ALERT_EVENT_TYPES = new Set([
  "check_in",
  "family_alert",
  "family_alert_patient",
  "family_alert_family",
  "system",
  "notification",
  "companion_checkin",
  "companion_silence",
  "companion_silence_patient",
  "companion_manual_alert",
  "companion_manual_patient",
]);

const ALERT_CONTENT_PATTERNS: RegExp[] = [
  /it['’]s Cledwyn checking in/i,
  /just checking in\. Open Cledwyn to reply/i,
  /I haven['’]t heard from you for /i,
  /hasn['’]t replied for /i,
  /automated check from Personal Settings/i,
  /I['’]m letting .+ know you['’]re okay to check on/i,
  /^Cledwyn Companion:/i,
  /^You asked me to let /i,
  /asked to alert you now/i,
  /asked Cledwyn to alert you/i,
];

export type CompanionHistoryMessage = {
  role?: string | null;
  content?: string | null;
  source?: string | null;
  eventType?: string | null;
  title?: string | null;
};

export type CompanionModelTurn = {
  role: "user" | "assistant";
  content: string;
  source: typeof COMPANION_CHAT_SOURCE;
};

export type FamilyContactRecord = {
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
};

function eventKey(message: CompanionHistoryMessage): string {
  const explicit = typeof message.eventType === "string" ? message.eventType.trim() : "";
  if (explicit) return explicit;
  if (message.source === "companion" && typeof message.title === "string") {
    return message.title.trim();
  }
  return "";
}

/** True for check-ins, family alerts, notifications, and other non-conversation lines. */
export function isAlertOrSystemLine(message: CompanionHistoryMessage): boolean {
  const role = (message.role || "").toLowerCase();
  if (role === "notification" || role === "system") return true;
  if (message.source === "network" || message.source === "notification") return true;
  const event = eventKey(message);
  if (COMPANION_ALERT_EVENT_TYPES.has(event)) return true;
  // Server-merged companion rows that aren't the user's own reply are system lines.
  if (message.source === "companion" && event !== "patient_reply") return true;
  const content = typeof message.content === "string" ? message.content : "";
  if (content && ALERT_CONTENT_PATTERNS.some((pattern) => pattern.test(content))) return true;
  return false;
}

export function isCompanionConversationTurn(message: CompanionHistoryMessage): boolean {
  const role = message.role;
  if (role !== "user" && role !== "assistant") return false;
  if (typeof message.content !== "string" || !message.content.trim()) return false;
  if (isAlertOrSystemLine(message)) return false;
  const event = eventKey(message);
  if (role === "user" && event === "patient_reply") return true;
  if (message.source === COMPANION_CHAT_SOURCE) return true;
  return false;
}

/**
 * Companion model history: this conversation only.
 * Back-to-back copies of the same turn are collapsed (a server echo of the
 * line just said). The same words later in the chat are kept.
 */
export function filterCompanionChatHistory(
  messages: readonly CompanionHistoryMessage[],
): CompanionModelTurn[] {
  const kept: CompanionModelTurn[] = [];
  let previousKey = "";
  for (const message of messages) {
    if (!isCompanionConversationTurn(message)) continue;
    const role = message.role === "user" ? "user" : "assistant";
    const content = message.content!.trim();
    const key = `${role}\n${content}`;
    if (key === previousKey) continue;
    previousKey = key;
    kept.push({ role, content, source: COMPANION_CHAT_SOURCE });
  }
  return kept;
}

/** Strip transport metadata before the V3 call. */
export function companionHistoryForModel(
  turns: readonly Pick<CompanionModelTurn, "role" | "content">[],
): { role: "user" | "assistant"; content: string }[] {
  return turns.map((turn) => ({ role: turn.role, content: turn.content }));
}

/**
 * Display name of the saved family contact. Ignores business names and any
 * names that appear only in chat history — callers must pass that contact's user row.
 */
export function resolveFamilyContactName(
  contact: FamilyContactRecord | null | undefined,
): string | null {
  if (!contact) return null;
  const full = [contact.firstName, contact.lastName]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean)
    .join(" ")
    .trim();
  if (full) return full;
  const username = typeof contact.username === "string" ? contact.username.trim() : "";
  return username || null;
}

export function familyContactNameFromCare(
  care: { familyContactUserId?: string | null } | null | undefined,
  contact: FamilyContactRecord | null | undefined,
  opts?: { patientUserId?: string | null },
): string | null {
  const id = (care?.familyContactUserId || "").trim();
  if (!id) return null;
  if (opts?.patientUserId && id === opts.patientUserId) return null;
  return resolveFamilyContactName(contact);
}

export type CompanionChatPayloadInput = {
  message: string;
  userId?: string | null;
  displayName?: string | null;
  history?: { role: string; content: string }[];
  sessionId?: string | null;
  profile?: string | null;
  voiceInput?: boolean;
  /** Saved family contact only. null when none is saved or the user row has no name. */
  familyContactName?: string | null;
  stream?: boolean;
};

/** Body for Lekker Network V3 `mode: "companion"`. `familyContactName` is always present. */
export function buildCompanionChatPayload(
  input: CompanionChatPayloadInput,
): Record<string, unknown> {
  return {
    mode: "companion",
    profile: input.profile || "dementia",
    message: input.message,
    userId: input.userId || undefined,
    displayName: input.displayName || undefined,
    history: input.history,
    sessionId: input.sessionId || undefined,
    voiceInput: input.voiceInput === true,
    familyContactName: input.familyContactName ?? null,
    ...(input.stream ? { stream: true } : {}),
  };
}

export function familyAlertPrecondition(input: {
  familyContactUserId?: string | null;
  contactFound: boolean;
}): { ok: true; familyContactUserId: string } | { ok: false; status: number; message: string } {
  const id = (input.familyContactUserId || "").trim();
  if (!id) {
    return { ok: false, status: 400, message: NO_FAMILY_CONTACT_MESSAGE };
  }
  if (!input.contactFound) {
    return { ok: false, status: 404, message: MISSING_FAMILY_CONTACT_MESSAGE };
  }
  return { ok: true, familyContactUserId: id };
}

/** Manual alert: companion mode first, then a saved contact who still has an account. */
export function companionAlertPrecondition(input: {
  companionEnabled: boolean;
  familyContactUserId?: string | null;
  contactFound: boolean;
}): { ok: true; familyContactUserId: string } | { ok: false; status: number; message: string } {
  if (!input.companionEnabled) {
    return { ok: false, status: 403, message: COMPANION_REQUIRED_MESSAGE };
  }
  return familyAlertPrecondition(input);
}

export type EmergencyAlertLimitResult =
  | { limited: false }
  | { limited: true; status: 429; message: string; retryAfterSeconds: number };

/**
 * Decide a manual family alert from the saved timestamp plus manual alerts
 * already stored in cledwyn_companion_messages. The server applies this inside
 * the row lock, then claims the slot with emergencyAlertClaimSql().
 */
export function evaluateEmergencyAlertLimit(input: {
  now: number;
  /** personal_care_settings.last_family_alert_sent_at. Covers cron and manual alerts. */
  lastFamilyAlertAt: number | null;
  /** created_at values of manual family_alert_patient rows. */
  manualAlertAt: readonly number[];
}): EmergencyAlertLimitResult {
  const last = input.lastFamilyAlertAt;
  if (last != null && input.now - last < EMERGENCY_ALERT_MIN_GAP_MS) {
    return {
      limited: true,
      status: 429,
      message: EMERGENCY_ALERT_GAP_MESSAGE,
      retryAfterSeconds: Math.max(1, Math.ceil((EMERGENCY_ALERT_MIN_GAP_MS - (input.now - last)) / 1000)),
    };
  }
  const recent = input.manualAlertAt.filter(
    (t) => t <= input.now && input.now - t < EMERGENCY_ALERT_HOUR_MS,
  );
  if (recent.length >= EMERGENCY_ALERT_HOURLY_CAP) {
    const oldest = Math.min(...recent);
    return {
      limited: true,
      status: 429,
      message: EMERGENCY_ALERT_HOURLY_MESSAGE,
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + EMERGENCY_ALERT_HOUR_MS - input.now) / 1000)),
    };
  }
  return { limited: false };
}

/**
 * Atomic claim across Cloud Run instances. Hourly cap counts existing manual
 * family_alert_patient rows (no new column). 0 rows = denied.
 */
export function emergencyAlertClaimSql(hourlyCap = EMERGENCY_ALERT_HOURLY_CAP): string {
  const cap = Number(hourlyCap);
  if (!Number.isInteger(cap) || cap < 1) {
    throw new Error("hourly cap must be a positive integer");
  }
  return `
UPDATE personal_care_settings AS s
SET last_family_alert_sent_at = now(), updated_at = now()
WHERE s.user_id = $1
  AND s.companion_enabled = true
  AND (
    s.last_family_alert_sent_at IS NULL
    OR s.last_family_alert_sent_at < now() - interval '2 minutes'
  )
  AND (
    SELECT count(*)::int
    FROM cledwyn_companion_messages m
    WHERE m.user_id = s.user_id
      AND m.event_type = 'family_alert_patient'
      AND m.created_at > now() - interval '1 hour'
      AND COALESCE(m.metadata->>'manual', 'false') = 'true'
  ) < ${cap}
RETURNING s.last_family_alert_sent_at AS claimed_at
`.trim();
}

/** Restore the previous timestamp only if this claim is still the current one. */
export const EMERGENCY_ALERT_RELEASE_SQL = `
UPDATE personal_care_settings
SET last_family_alert_sent_at = $2, updated_at = now()
WHERE user_id = $1
  AND last_family_alert_sent_at = $3
`.trim();

export type EmergencyAlertGateResult =
  | { proceed: true }
  | {
      proceed: false;
      status: number;
      retryAfterSeconds?: number;
      body: { success: false; alertSent: false; message: string };
    };

/** Maps precondition + rate-limit state to the emergency-alert HTTP result. */
export function emergencyAlertGate(
  precondition: ReturnType<typeof familyAlertPrecondition>,
  rate: EmergencyAlertLimitResult,
): EmergencyAlertGateResult {
  if (!precondition.ok) {
    return {
      proceed: false,
      status: precondition.status,
      body: { success: false, alertSent: false, message: precondition.message },
    };
  }
  if (rate.limited) {
    return {
      proceed: false,
      status: 429,
      retryAfterSeconds: rate.retryAfterSeconds,
      body: { success: false, alertSent: false, message: rate.message },
    };
  }
  return { proceed: true };
}
