/**
 * Route Expo / local notification taps into the right Chat screen.
 */
import { router } from "expo-router";

export function routeNotificationData(data: Record<string, unknown> | undefined | null) {
  if (!data || typeof data !== "object") return;

  const type = typeof data.type === "string" ? data.type : "";
  const href = typeof data.href === "string" ? data.href : "";
  const conversationId =
    typeof data.conversationId === "string"
      ? data.conversationId
      : typeof data.chatId === "string"
        ? data.chatId
        : "";

  if (type === "network_notification" || (href.startsWith("/app") && type !== "message")) {
    const next = href.startsWith("/app") ? href : "/app";
    router.push({ pathname: "/(tabs)/software", params: { next } });
    return;
  }

  if (type.startsWith("companion_") || type === "companion_checkin" || type === "companion_silence") {
    router.push("/(tabs)/cledwyn");
    return;
  }

  if (conversationId && conversationId !== "__cledwyn_companion__") {
    router.push({ pathname: "/chat/[id]", params: { id: conversationId } });
    return;
  }

  if (type === "message" || type === "messages_dm" || type === "messages_group") {
    router.push("/(tabs)");
  }
}
