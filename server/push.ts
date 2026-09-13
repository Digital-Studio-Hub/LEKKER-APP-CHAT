import { and, eq, inArray } from "drizzle-orm";
import { db } from "./storage";
import { pushTokens, users } from "@shared/schema";
import type { ChatMessage } from "@shared/schema";
import {
  parseNotificationPreferences,
  DND_BYPASS_CATEGORIES,
  type NotificationCategory,
} from "@shared/notification-prefs";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export async function registerPushToken(
  userId: string,
  expoPushToken: string,
  platform?: string,
): Promise<void> {
  const existing = await db
    .select()
    .from(pushTokens)
    .where(eq(pushTokens.expoPushToken, expoPushToken))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(pushTokens)
      .set({ userId, platform: platform || null, updatedAt: new Date() })
      .where(eq(pushTokens.expoPushToken, expoPushToken));
    return;
  }

  await db.insert(pushTokens).values({
    userId,
    expoPushToken,
    platform: platform || null,
  });
}

export async function unregisterPushToken(userId: string, expoPushToken?: string): Promise<void> {
  if (expoPushToken) {
    await db
      .delete(pushTokens)
      .where(and(eq(pushTokens.userId, userId), eq(pushTokens.expoPushToken, expoPushToken)));
    return;
  }
  await db.delete(pushTokens).where(eq(pushTokens.userId, userId));
}

async function sendExpoPush(
  messages: Array<{
    to: string;
    title: string;
    body: string;
    data?: Record<string, string>;
    sound?: "default" | null;
    channelId?: string;
  }>,
): Promise<void> {
  if (messages.length === 0) return;

  const chunks: typeof messages[] = [];
  for (let i = 0; i < messages.length; i += 100) {
    chunks.push(messages.slice(i, i + 100));
  }

  for (const chunk of chunks) {
    try {
      const payload = chunk.map((m) => ({
        to: m.to,
        title: m.title,
        body: m.body,
        data: m.data,
        sound: m.sound ?? "default",
        priority: "high" as const,
        channelId: m.channelId || "messages",
        _contentAvailable: true,
      }));
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const bodyText = await res.text();
      if (!res.ok) {
        console.error("[Push] Expo API error:", res.status, bodyText);
      } else {
        try {
          const parsed = JSON.parse(bodyText);
          const tickets = parsed?.data;
          if (Array.isArray(tickets)) {
            for (const t of tickets) {
              if (t?.status === "error") {
                console.error("[Push] Expo ticket error:", t.message, t.details);
              }
            }
          }
        } catch {
          /* ignore parse */
        }
      }
    } catch (e) {
      console.error("[Push] Failed to send:", e);
    }
  }
}

function messagePreview(message: ChatMessage): string {
  if (message.isDeleted) return "Message deleted";
  switch (message.type) {
    case "image":
      return "📷 Photo";
    case "audio":
      return "🎤 Voice message";
    case "file":
      return message.fileName ? `📎 ${message.fileName}` : "📎 File";
    case "location":
      return message.locationName ? `📍 ${message.locationName}` : "📍 Location";
    case "contact":
      return message.sharedContactName
        ? `👤 ${message.sharedContactName}`
        : "👤 Contact";
    case "poll":
      return message.pollQuestion ? `📊 ${message.pollQuestion}` : "📊 Poll";
    default:
      if (message.content?.trim()) {
        const text = message.content.trim();
        return text.length > 80 ? `${text.slice(0, 77)}...` : text;
      }
      return "New message";
  }
}

function androidChannelFor(category: NotificationCategory): string {
  switch (category) {
    case "enquiries":
      return "enquiries";
    case "companion":
      return "companion";
    case "schedule":
      return "schedule";
    case "workspace":
      return "workspace";
    default:
      return "messages";
  }
}

/**
 * Whether this user should receive a push for the given category.
 * Master switch off → never. Category off → no. DND → only bypass categories.
 */
export function shouldDeliverPush(opts: {
  notificationsEnabled: boolean | null | undefined;
  notificationPreferences: unknown;
  presence: string | null | undefined;
  category: NotificationCategory;
  /** Force deliver even in DND (e.g. explicit urgent family alert). */
  urgent?: boolean;
}): boolean {
  if (opts.notificationsEnabled === false) return false;
  const prefs = parseNotificationPreferences(opts.notificationPreferences);
  if (prefs[opts.category] === false) return false;
  if (opts.presence === "dnd" && !opts.urgent && !DND_BYPASS_CATEGORIES.has(opts.category)) {
    return false;
  }
  return true;
}

export async function notifyChatMessage(
  chatId: string,
  senderId: string,
  message: ChatMessage,
): Promise<void> {
  try {
    const { storage } = await import("./storage");
    const chat = await storage.getChat(chatId);
    if (!chat || chat.type === "notes") return; // Quick Notes — self only

    const category: NotificationCategory =
      chat.type === "group" ? "messages_group" : "messages_dm";

    const participants = await storage.getChatParticipants(chatId);
    const recipientIds = participants
      .map((p) => p.userId)
      .filter((id) => id !== senderId);

    if (recipientIds.length === 0) return;

    const recipientUsers = await db
      .select({
        id: users.id,
        notificationsEnabled: users.notificationsEnabled,
        notificationPreferences: users.notificationPreferences,
        presence: users.presence,
      })
      .from(users)
      .where(inArray(users.id, recipientIds));

    const enabledIds = recipientUsers
      .filter((u) =>
        shouldDeliverPush({
          notificationsEnabled: u.notificationsEnabled,
          notificationPreferences: u.notificationPreferences,
          presence: u.presence,
          category,
        }),
      )
      .map((u) => u.id);

    if (enabledIds.length === 0) return;

    for (const recipientId of enabledIds) {
      if (await storage.isEitherUserBlocked(senderId, recipientId)) continue;

      const tokens = await db
        .select({ expoPushToken: pushTokens.expoPushToken })
        .from(pushTokens)
        .where(eq(pushTokens.userId, recipientId));

      if (tokens.length === 0) continue;

      const sender = await storage.getUser(senderId);
      const senderName =
        (sender
          ? `${sender.firstName || ""} ${sender.lastName || ""}`.trim() ||
            sender.username ||
            sender.businessName ||
            sender.tradingName
          : null) || "Someone";

      const preview = messagePreview(message);
      await sendExpoPush(
        tokens.map((t) => ({
          to: t.expoPushToken,
          title: String(senderName),
          body: preview,
          channelId: androidChannelFor(category),
          data: {
            chatId,
            type: "message",
            category,
            messageId: message.id,
          },
        })),
      );
    }
  } catch (e) {
    console.error("[Push] notifyChatMessage error:", e);
  }
}

export type NotifyUserPushOpts = {
  category?: NotificationCategory;
  urgent?: boolean;
};

/** Push a user by Chat userId (enquiry replies, companion, workspace, system). */
export async function notifyUserPush(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, string>,
  opts?: NotifyUserPushOpts,
): Promise<void> {
  try {
    const category: NotificationCategory =
      opts?.category ||
      (data?.type === "enquiry_reply"
        ? "enquiries"
        : data?.type === "companion_checkin" || data?.type === "companion_silence"
          ? "companion"
          : data?.type === "schedule" || data?.type === "meet_reminder"
            ? "schedule"
            : data?.type === "workspace" || data?.category === "workspace"
              ? "workspace"
              : "workspace");

    const [u] = await db
      .select({
        notificationsEnabled: users.notificationsEnabled,
        notificationPreferences: users.notificationPreferences,
        presence: users.presence,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (
      !shouldDeliverPush({
        notificationsEnabled: u?.notificationsEnabled,
        notificationPreferences: u?.notificationPreferences,
        presence: u?.presence,
        category,
        urgent: opts?.urgent,
      })
    ) {
      return;
    }

    const tokens = await db
      .select({ expoPushToken: pushTokens.expoPushToken })
      .from(pushTokens)
      .where(eq(pushTokens.userId, userId));
    if (!tokens.length) return;

    await sendExpoPush(
      tokens.map((t) => ({
        to: t.expoPushToken,
        title,
        body: body.length > 120 ? `${body.slice(0, 117)}…` : body,
        channelId: androidChannelFor(category),
        data: { ...(data || {}), category },
      })),
    );
  } catch (e) {
    console.error("[Push] notifyUserPush error:", e);
  }
}
