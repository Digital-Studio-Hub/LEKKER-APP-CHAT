import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const NOTIF_KEY = "lekker_notifications_enabled";

let Notifications: typeof import("expo-notifications") | null = null;

async function getNotifications() {
  if (Notifications) return Notifications;
  if (Platform.OS === "web") return null;
  try {
    Notifications = await import("expo-notifications");
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    return Notifications;
  } catch {
    return null;
  }
}

export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === "web") {
    await AsyncStorage.setItem(NOTIF_KEY, "true");
    return true;
  }

  const N = await getNotifications();
  if (!N) return false;

  const { status: existingStatus, canAskAgain } = await N.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    if (!canAskAgain) {
      return false;
    }
    const { status } = await N.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus === "granted") {
    await AsyncStorage.setItem(NOTIF_KEY, "true");
    return true;
  }

  return false;
}

export async function areNotificationsEnabled(): Promise<boolean> {
  if (Platform.OS === "web") {
    const stored = await AsyncStorage.getItem(NOTIF_KEY);
    return stored === "true";
  }

  const N = await getNotifications();
  if (!N) return false;

  const { status } = await N.getPermissionsAsync();
  if (status !== "granted") {
    await AsyncStorage.removeItem(NOTIF_KEY);
    return false;
  }

  const stored = await AsyncStorage.getItem(NOTIF_KEY);
  return stored === "true";
}

export async function disableNotifications(): Promise<void> {
  await AsyncStorage.removeItem(NOTIF_KEY);
}

export async function canAskForNotifications(): Promise<boolean> {
  if (Platform.OS === "web") return true;
  const N = await getNotifications();
  if (!N) return false;
  const { canAskAgain, status } = await N.getPermissionsAsync();
  return status !== "granted" && canAskAgain !== false;
}

export async function sendLocalNotification(title: string, body: string, data?: Record<string, string>) {
  if (Platform.OS === "web") return;

  try {
    const enabled = await areNotificationsEnabled();
    if (!enabled) return;

    const N = await getNotifications();
    if (!N) return;

    await N.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: data || {},
        sound: "default",
      },
      trigger: null,
    });
  } catch (e) {
    console.error("Notification error:", e);
  }
}

export async function sendMessageNotification(senderName: string, messageContent: string, conversationId: string) {
  const preview = messageContent.length > 60 ? messageContent.substring(0, 57) + "..." : messageContent;
  await sendLocalNotification(
    senderName,
    preview,
    { conversationId, type: "message" },
  );
}

export async function setBadgeCount(count: number) {
  if (Platform.OS === "web") return;
  try {
    const N = await getNotifications();
    if (!N) return;
    await N.setBadgeCountAsync(count);
  } catch (e) {}
}

const PUSH_TOKEN_KEY = "lekker_push_token";

export async function getExpoPushToken(): Promise<string | null> {
  if (Platform.OS === "web") return null;
  try {
    const N = await getNotifications();
    if (!N) return null;

    const { status } = await N.getPermissionsAsync();
    if (status !== "granted") return null;

    const cached = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
    if (cached) return cached;

    const tokenData = await N.getExpoPushTokenAsync().catch(() => null);
    if (!tokenData) return null;

    const token = tokenData.data;
    await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
    return token;
  } catch (e) {
    console.warn("[Push] Failed to get Expo push token:", e);
    return null;
  }
}

export async function clearStoredPushToken(): Promise<string | null> {
  const token = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
  await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
  return token;
}
