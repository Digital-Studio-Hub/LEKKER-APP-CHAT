import { and, eq, inArray } from "drizzle-orm";
import { db } from "./storage";
import { pushTokens, users } from "@shared/schema";
import type { ChatMessage } from "@shared/schema";

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
  }>,
): Promise<void> {
  if (messages.length === 0) return;

  const chunks: typeof messages[] = [];
  for (let i = 0; i < messages.length; i += 100) {
    chunks.push(messages.slice(i, i + 100));
  }

  for (const chunk of chunks) {
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(chunk.map((m) => ({
          to: m.to,
          title: m.title,
          body: m.body,
          data: m.data,
          sound: m.sound ?? "default",
          priority: "high",
        }))),
      });
      if (!res.ok) {
        console.error("[Push] Expo API error:", res.status, await res.text());
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

export async function notifyChatMessage(
  chatId: string,
  senderId: string,
  message: ChatMessage,
): Promise<void> {
  try {
    const { storage } = await import("./storage");
    const participants = await storage.getChatParticipants(chatId);
    const recipientIds = participants
      .map((p) => p.userId)
      .filter((id) => id !== senderId);

    if (recipientIds.length === 0) return;

    const recipientUsers = await db
      .select({
        id: users.id,
        notificationsEnabled: users.notificationsEnabled,
      })
      .from(users)
      .where(inArray(users.id, recipientIds));

    const enabledIds = recipientUsers
      .filter((u) => u.notificationsEnabled !== false)
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
      const senderName = sender
        ? `${sender.firstName} ${sender.lastName}`.trim() || sender.username
        : "Someone";

      const preview = messagePreview(message);
      await sendExpoPush(
        tokens.map((t) => ({
          to: t.expoPushToken,
          title: senderName,
          body: preview,
          data: {
            chatId,
            type: "message",
            messageId: message.id,
          },
        })),
      );
    }
  } catch (e) {
    console.error("[Push] notifyChatMessage error:", e);
  }
}