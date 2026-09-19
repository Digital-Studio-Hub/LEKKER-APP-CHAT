import { and, desc, eq, gte } from "drizzle-orm";
import {
  personalCareSettings,
  cledwynCompanionMessages,
  pushTokens,
  type PersonalCareSettings,
  type UpdatePersonalCareInput,
  type CledwynCompanionMessage,
  CHECK_IN_INTERVAL_PRESETS,
  SILENCE_ALERT_PRESETS,
} from "@shared/schema";
import { db, storage, pool } from "./storage";
import { notifyUserPush } from "./push";

let companionTableReady = false;

/** Idempotent schema ensure (Publish ≠ migrate). */
export async function ensureCompanionMessagesTable(): Promise<void> {
  if (companionTableReady) return;
  await pool.query(`
CREATE TABLE IF NOT EXISTS cledwyn_companion_messages (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id varchar(36) NOT NULL,
  about_user_id varchar(36) NOT NULL,
  role varchar(20) NOT NULL,
  event_type varchar(40) NOT NULL,
  content text NOT NULL,
  metadata jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cledwyn_companion_user_created
  ON cledwyn_companion_messages (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_cledwyn_companion_about
  ON cledwyn_companion_messages (about_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_cledwyn_companion_event
  ON cledwyn_companion_messages (event_type, created_at);
ALTER TABLE personal_care_settings
  ADD COLUMN IF NOT EXISTS companion_last_read_at timestamp;
  `);
  companionTableReady = true;
}

const DEFAULTS = {
  safeBrowseEnabled: false,
  companionEnabled: false,
  companionProfile: "dementia",
  checkInIntervalHours: 4,
  silenceAlertAfterHours: 4,
  familyContactUserId: null as string | null,
};

export function publicPersonalCare(row: PersonalCareSettings | null | undefined) {
  if (!row) {
    return {
      ...DEFAULTS,
      lastPatientReplyAt: null as string | null,
      lastCheckInSentAt: null as string | null,
      lastFamilyAlertSentAt: null as string | null,
    };
  }
  return {
    safeBrowseEnabled: row.safeBrowseEnabled,
    companionEnabled: row.companionEnabled,
    companionProfile: row.companionProfile,
    checkInIntervalHours: row.checkInIntervalHours,
    silenceAlertAfterHours: row.silenceAlertAfterHours,
    familyContactUserId: row.familyContactUserId,
    lastPatientReplyAt: row.lastPatientReplyAt ? row.lastPatientReplyAt.toISOString() : null,
    lastCheckInSentAt: row.lastCheckInSentAt ? row.lastCheckInSentAt.toISOString() : null,
    lastFamilyAlertSentAt: row.lastFamilyAlertSentAt ? row.lastFamilyAlertSentAt.toISOString() : null,
  };
}

export async function getPersonalCare(userId: string): Promise<PersonalCareSettings | undefined> {
  const [row] = await db
    .select()
    .from(personalCareSettings)
    .where(eq(personalCareSettings.userId, userId))
    .limit(1);
  return row;
}

export async function getOrCreatePersonalCare(userId: string): Promise<PersonalCareSettings> {
  const existing = await getPersonalCare(userId);
  if (existing) return existing;
  const [created] = await db
    .insert(personalCareSettings)
    .values({ userId })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  const again = await getPersonalCare(userId);
  if (!again) throw new Error("Failed to create personal care settings");
  return again;
}

export async function updatePersonalCare(
  userId: string,
  patch: UpdatePersonalCareInput,
): Promise<PersonalCareSettings> {
  await getOrCreatePersonalCare(userId);

  if (patch.familyContactUserId) {
    if (patch.familyContactUserId === userId) {
      throw Object.assign(new Error("Family contact cannot be yourself"), { status: 400 });
    }
    const family = await storage.getUser(patch.familyContactUserId);
    if (!family) {
      throw Object.assign(new Error("Family contact not found on Lekker Chat"), { status: 404 });
    }
  }

  const data: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.safeBrowseEnabled !== undefined) data.safeBrowseEnabled = patch.safeBrowseEnabled;
  if (patch.companionEnabled !== undefined) data.companionEnabled = patch.companionEnabled;
  if (patch.companionProfile !== undefined) data.companionProfile = patch.companionProfile;
  if (patch.checkInIntervalHours !== undefined) {
    if (!(CHECK_IN_INTERVAL_PRESETS as readonly number[]).includes(patch.checkInIntervalHours)) {
      throw Object.assign(new Error("Invalid check-in interval"), { status: 400 });
    }
    data.checkInIntervalHours = patch.checkInIntervalHours;
  }
  if (patch.silenceAlertAfterHours !== undefined) {
    if (!(SILENCE_ALERT_PRESETS as readonly number[]).includes(patch.silenceAlertAfterHours)) {
      throw Object.assign(new Error("Invalid silence alert interval"), { status: 400 });
    }
    data.silenceAlertAfterHours = patch.silenceAlertAfterHours;
  }
  if (patch.familyContactUserId !== undefined) {
    data.familyContactUserId = patch.familyContactUserId;
  }

  // When companion is first enabled, seed lastPatientReplyAt so we don't alert immediately.
  if (patch.companionEnabled === true) {
    const current = await getPersonalCare(userId);
    if (current && !current.lastPatientReplyAt) {
      data.lastPatientReplyAt = new Date();
    }
  }

  const [updated] = await db
    .update(personalCareSettings)
    .set(data)
    .where(eq(personalCareSettings.userId, userId))
    .returning();
  return updated;
}

export async function bumpPatientReply(
  userId: string,
  opts?: { content?: string; recordMessage?: boolean },
): Promise<void> {
  const row = await getPersonalCare(userId);
  if (!row?.companionEnabled) return;
  await db
    .update(personalCareSettings)
    .set({ lastPatientReplyAt: new Date(), updatedAt: new Date() })
    .where(eq(personalCareSettings.userId, userId));

  // Optional: mirror the reply into the companion thread for habit analysis.
  if (opts?.recordMessage && opts.content?.trim()) {
    try {
      await appendCompanionMessage({
        userId,
        aboutUserId: userId,
        role: "user",
        eventType: "patient_reply",
        content: opts.content.trim().slice(0, 4000),
      });
    } catch (e) {
      console.warn("[Companion] record patient_reply failed:", e);
    }
  }
}

function formatDurationHours(ms: number): string {
  const hours = Math.max(1, Math.round(ms / (60 * 60 * 1000)));
  if (hours === 1) return "about 1 hour";
  if (hours < 48) return `about ${hours} hours`;
  const days = Math.round(hours / 24);
  return days === 1 ? "about 1 day" : `about ${days} days`;
}

export async function appendCompanionMessage(input: {
  userId: string;
  aboutUserId: string;
  role?: "assistant" | "system" | "user";
  eventType: string;
  content: string;
  metadata?: Record<string, unknown>;
}): Promise<CledwynCompanionMessage> {
  const [row] = await db
    .insert(cledwynCompanionMessages)
    .values({
      userId: input.userId,
      aboutUserId: input.aboutUserId,
      role: input.role || "assistant",
      eventType: input.eventType,
      content: input.content,
      metadata: input.metadata || null,
    })
    .returning();
  return row;
}

export async function listCompanionMessages(
  userId: string,
  opts?: { limit?: number; since?: Date },
): Promise<CledwynCompanionMessage[]> {
  const limit = Math.min(200, Math.max(1, opts?.limit ?? 80));
  const where = opts?.since
    ? and(eq(cledwynCompanionMessages.userId, userId), gte(cledwynCompanionMessages.createdAt, opts.since))
    : eq(cledwynCompanionMessages.userId, userId);
  const rows = await db
    .select()
    .from(cledwynCompanionMessages)
    .where(where)
    .orderBy(desc(cledwynCompanionMessages.createdAt))
    .limit(limit);
  return rows.reverse();
}

export async function getCompanionInboxSummary(userId: string): Promise<{
  latest: CledwynCompanionMessage | null;
  unreadCount: number;
} | null> {
  await ensureCompanionMessagesTable();
  const [latest] = await db
    .select()
    .from(cledwynCompanionMessages)
    .where(eq(cledwynCompanionMessages.userId, userId))
    .orderBy(desc(cledwynCompanionMessages.createdAt))
    .limit(1);
  if (!latest) return null;

  let care = await getPersonalCare(userId);
  if (!care) {
    try {
      care = await getOrCreatePersonalCare(userId);
    } catch {
      care = undefined;
    }
  }
  const lastRead = care?.companionLastReadAt;
  let unreadCount = 0;
  if (!lastRead) {
    const all = await db
      .select({ id: cledwynCompanionMessages.id })
      .from(cledwynCompanionMessages)
      .where(eq(cledwynCompanionMessages.userId, userId));
    unreadCount = all.length;
  } else {
    const result = await pool.query(
      `SELECT count(*)::int AS n FROM cledwyn_companion_messages
       WHERE user_id = $1 AND created_at > $2`,
      [userId, lastRead],
    );
    unreadCount = Number(result.rows[0]?.n || 0);
  }

  return { latest, unreadCount: Math.min(99, unreadCount) };
}

export async function markCompanionRead(userId: string): Promise<void> {
  await ensureCompanionMessagesTable();
  await getOrCreatePersonalCare(userId);
  await db
    .update(personalCareSettings)
    .set({ companionLastReadAt: new Date(), updatedAt: new Date() })
    .where(eq(personalCareSettings.userId, userId));
}

/** Notify via push + SSE; never fail the cron if push has no tokens. */
export async function deliverCompanionNotice(
  userId: string,
  title: string,
  body: string,
  data: Record<string, string>,
  opts?: { urgent?: boolean; messageId?: string },
): Promise<{ pushed: boolean; tokenCount: number }> {
  const tokens = await db
    .select({ expoPushToken: pushTokens.expoPushToken })
    .from(pushTokens)
    .where(eq(pushTokens.userId, userId));
  const tokenCount = tokens.length;

  if (tokenCount === 0) {
    console.warn(
      `[Companion] no push tokens for user=${userId} type=${data.type || "?"} — surface via Chats inbox + Cledwyn sync`,
    );
  }

  await notifyUserPush(userId, title, body, data, {
    category: "companion",
    urgent: opts?.urgent ?? true,
  });

  const messageId = opts?.messageId || data.messageId || `companion-${Date.now()}`;
  try {
    const { publishRealtimeEvent } = await import("./realtime");
    await publishRealtimeEvent({
      type: "message.created",
      chatId: "__cledwyn_companion__",
      messageId,
      senderId: "cledwyn",
      targetUserId: userId,
      createdAt: new Date().toISOString(),
      preview: body.slice(0, 120),
      message: {
        id: messageId,
        chatId: "__cledwyn_companion__",
        senderId: "cledwyn",
        content: body,
        type: "text",
        status: "sent",
        createdAt: new Date() as any,
      },
    });
  } catch (e) {
    console.warn("[Companion] realtime fanout failed:", e);
  }

  return { pushed: tokenCount > 0, tokenCount };
}

/**
 * Cloud Scheduler / inline entry — companion check-ins + family silence alerts.
 * All conversational lines go into Cledwyn companion threads (not patient↔family DMs).
 */
export async function runCompanionCron(): Promise<{
  checked: number;
  checkIns: number;
  familyAlerts: number;
}> {
  await ensureCompanionMessagesTable();
  const rows = await db
    .select()
    .from(personalCareSettings)
    .where(eq(personalCareSettings.companionEnabled, true));

  let checkIns = 0;
  let familyAlerts = 0;
  const now = Date.now();

  for (const row of rows) {
    try {
      const patient = await storage.getUser(row.userId);
      if (!patient) continue;
      const patientName =
        `${patient.firstName || ""} ${patient.lastName || ""}`.trim() ||
        patient.username ||
        "Your loved one";
      const patientFirst = patient.firstName || "there";

      const checkInMs = row.checkInIntervalHours * 60 * 60 * 1000;
      const lastCheck = row.lastCheckInSentAt?.getTime() ?? 0;
      const lastReply = row.lastPatientReplyAt?.getTime() ?? row.createdAt.getTime();
      const sinceReply = now - lastReply;

      // --- Continuous check-in into PATIENT's Cledwyn thread ---
      // Fire on interval while they are quiet. Dementia users won't remember to
      // open Cledwyn — we must keep prompting in the AI chat + push.
      if (sinceReply >= checkInMs && now - lastCheck >= checkInMs) {
        const checkBody =
          `Hi ${patientFirst} — it's Cledwyn checking in. How are you feeling right now?\n\n` +
          `Please reply here when you can. I'm here with you.`;

        const checkMsg = await appendCompanionMessage({
          userId: row.userId,
          aboutUserId: row.userId,
          role: "assistant",
          eventType: "check_in",
          content: checkBody,
          metadata: {
            checkInIntervalHours: row.checkInIntervalHours,
            sinceReplyMs: sinceReply,
          },
        });

        await deliverCompanionNotice(
          row.userId,
          "Cledwyn",
          `Hi ${patientFirst} — just checking in. Open Cledwyn to reply.`,
          { type: "companion_checkin", href: "/(tabs)/cledwyn", messageId: checkMsg.id },
          { urgent: true, messageId: checkMsg.id },
        );

        await db
          .update(personalCareSettings)
          .set({ lastCheckInSentAt: new Date(), updatedAt: new Date() })
          .where(eq(personalCareSettings.userId, row.userId));
        checkIns++;
      }

      // --- Family silence alert (Cledwyn threads only — never P2P DM) ---
      if (!row.familyContactUserId) continue;
      const silenceMs = row.silenceAlertAfterHours * 60 * 60 * 1000;
      const lastAlert = row.lastFamilyAlertSentAt?.getTime() ?? 0;
      if (sinceReply < silenceMs) continue;
      // Cooldown: don't re-alert more often than the silence interval itself
      if (now - lastAlert < silenceMs) continue;

      const family = await storage.getUser(row.familyContactUserId);
      const familyName =
        `${family?.firstName || ""} ${family?.lastName || ""}`.trim() ||
        family?.username ||
        "your family contact";
      const duration = formatDurationHours(sinceReply);
      const lastReplyLabel = new Date(lastReply).toLocaleString("en-ZA", {
        timeZone: "Africa/Johannesburg",
      });

      // Patient Cledwyn: transparent notice that family was contacted
      const patientNotice = await appendCompanionMessage({
        userId: row.userId,
        aboutUserId: row.userId,
        role: "assistant",
        eventType: "family_alert_patient",
        content:
          `Hey ${patientFirst} — I haven't heard from you for ${duration}, so I'm letting ${familyName} know you're okay to check on.\n\n` +
          `You can reply here anytime. This keeps your chats with family clean — I'm holding these check-ins in our conversation.`,
        metadata: {
          familyContactUserId: row.familyContactUserId,
          sinceReplyMs: sinceReply,
          lastPatientReplyAt: new Date(lastReply).toISOString(),
        },
      });

      // Family Cledwyn: alert in their AI chat (not the DM with the patient)
      const familyNotice = await appendCompanionMessage({
        userId: row.familyContactUserId,
        aboutUserId: row.userId,
        role: "assistant",
        eventType: "family_alert_family",
        content:
          `Cledwyn Companion: ${patientName} hasn't replied for ${duration}.\n` +
          `Last reply was ${lastReplyLabel}.\n\n` +
          `This is an automated check from Personal Settings — not a medical emergency notice. ` +
          `Open Cledwyn for details — check-ins live there for habit review later.`,
        metadata: {
          patientUserId: row.userId,
          sinceReplyMs: sinceReply,
          lastPatientReplyAt: new Date(lastReply).toISOString(),
        },
      });

      await deliverCompanionNotice(
        row.userId,
        "Cledwyn",
        `I haven't heard from you, so I let ${familyName} know.`,
        { type: "companion_silence_patient", href: "/(tabs)/cledwyn", messageId: patientNotice.id },
        { urgent: true, messageId: patientNotice.id },
      );
      await deliverCompanionNotice(
        row.familyContactUserId,
        "Cledwyn Companion",
        `${patientName} hasn't replied for ${duration}. Open Cledwyn for details.`,
        {
          type: "companion_silence",
          href: "/(tabs)/cledwyn",
          aboutUserId: row.userId,
          messageId: familyNotice.id,
        },
        { urgent: true, messageId: familyNotice.id },
      );

      await db
        .update(personalCareSettings)
        .set({ lastFamilyAlertSentAt: new Date(), updatedAt: new Date() })
        .where(eq(personalCareSettings.userId, row.userId));
      familyAlerts++;
    } catch (e) {
      console.error("[CompanionCron] row failed", row.userId, e);
    }
  }

  return { checked: rows.length, checkIns, familyAlerts };
}
