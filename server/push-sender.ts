const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export async function sendPushNotifications(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<void> {
  if (tokens.length === 0) return;

  const messages = tokens
    .filter((t) => t.startsWith("ExponentPushToken[") || t.startsWith("ExpoPushToken["))
    .map((token) => ({
      to: token,
      sound: "default",
      title,
      body,
      data: data || {},
      priority: "high",
    }));

  if (messages.length === 0) return;

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify(messages),
    });
    if (!res.ok) {
      console.error("[Push] Expo API error:", res.status, await res.text());
    }
  } catch (e) {
    console.error("[Push] Failed to send:", e);
  }
}
