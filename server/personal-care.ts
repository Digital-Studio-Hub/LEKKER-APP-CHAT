import { eq } from "drizzle-orm";
import {
  personalCareSettings,
  type PersonalCareSettings,
  type UpdatePersonalCareInput,
  CHECK_IN_INTERVAL_PRESETS,
  SILENCE_ALERT_PRESETS,
} from "@shared/schema";
import { db, storage } from "./storage";
import { notifyChatMessage, notifyUserPush } from "./push";

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

export async function bumpPatientReply(userId: string): Promise<void> {
  const row = await getPersonalCare(userId);
  if (!row?.companionEnabled) return;
  await db
    .update(personalCareSettings)
    .set({ lastPatientReplyAt: new Date(), updatedAt: new Date() })
    .where(eq(personalCareSettings.userId, userId));
}

function formatDurationHours(ms: number): string {
  const hours = Math.max(1, Math.round(ms / (60 * 60 * 1000)));
  if (hours === 1) return "about 1 hour";
  if (hours < 48) return `about ${hours} hours`;
  const days = Math.round(hours / 24);
  return days === 1 ? "about 1 day" : `about ${days} days`;
}

async function ensureP2PChat(userId: string, participantId: string) {
  const existing = await storage.findExistingP2PChat(userId, participantId);
  if (existing) return existing;
  const chat = await storage.createChat("p2p", userId);
  await storage.addChatParticipant(chat.id, userId, "owner");
  await storage.addChatParticipant(chat.id, participantId, "member");
  return chat;
}

/** Cloud Scheduler entry — companion check-ins + family silence alerts. */
export async function runCompanionCron(): Promise<{
  checked: number;
  checkIns: number;
  familyAlerts: number;
}> {
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

      // --- Proactive companion check-in to patient ---
      const checkInMs = row.checkInIntervalHours * 60 * 60 * 1000;
      const lastCheck = row.lastCheckInSentAt?.getTime() ?? 0;
      const lastReply = row.lastPatientReplyAt?.getTime() ?? row.createdAt.getTime();
      // Nudge if they've been quiet at least one check-in interval since last check-in
      if (now - lastCheck >= checkInMs && now - lastReply >= checkInMs) {
        await notifyUserPush(
          row.userId,
          "Cledwyn",
          `Hi ${patient.firstName || "there"} — just checking in. How are you feeling? Open Cledwyn anytime.`,
          { type: "companion_checkin" },
        );
        await db
          .update(personalCareSettings)
          .set({ lastCheckInSentAt: new Date(), updatedAt: new Date() })
          .where(eq(personalCareSettings.userId, row.userId));
        checkIns++;
      }

      // --- Family silence alert ---
      if (!row.familyContactUserId) continue;
      const silenceMs = row.silenceAlertAfterHours * 60 * 60 * 1000;
      const lastAlert = row.lastFamilyAlertSentAt?.getTime() ?? 0;
      const sinceReply = now - lastReply;
      if (sinceReply < silenceMs) continue;
      // Cooldown: don't re-alert more often than the silence interval itself
      if (now - lastAlert < silenceMs) continue;

      const chat = await ensureP2PChat(row.userId, row.familyContactUserId);
      const body =
        `Cledwyn Companion alert: ${patientName} hasn't replied for ${formatDurationHours(sinceReply)}. ` +
        `Last reply was ${new Date(lastReply).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg" })}. ` +
        `This is an automated check from Personal Settings — not a medical emergency notice.`;

      const message = await storage.sendMessage(chat.id, row.userId, body, "text");
      await notifyChatMessage(chat.id, row.userId, message);
      await notifyUserPush(
        row.familyContactUserId,
        "Cledwyn Companion",
        `${patientName} hasn't replied for ${formatDurationHours(sinceReply)}.`,
        { type: "companion_silence", chatId: chat.id },
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
