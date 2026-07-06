import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { registerPushTokenOnServer, unregisterPushTokenOnServer } from "@/lib/push-api";

const NOTIF_KEY = "lekker_notifications_enabled";
const PUSH_TOKEN_KEY = "lekker_expo_push_token";

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
    void registerDevicePushToken();
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
  await unregisterDevicePushToken();
}

async function getExpoProjectId(): Promise<string | undefined> {
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;
  if (!projectId || projectId === "lekker-chat") return undefined;
  return projectId;
}

export async function getDevicePushToken(): Promise<string | null> {
  if (Platform.OS === "web") return null;

  const N = await getNotifications();
  if (!N) return null;

  const projectId = await getExpoProjectId();
  if (!projectId) {
    console.warn("[Push] EAS projectId not configured — run eas init");
    return null;
  }

  try {
    const tokenData = await N.getExpoPushTokenAsync({ projectId });
    return tokenData.data;
  } catch (e) {
    console.error("[Push] getExpoPushTokenAsync failed:", e);
    return null;
  }
}

export async function registerDevicePushToken(): Promise<boolean> {
  const granted = await areNotificationsEnabled();
  if (!granted) return false;

  const token = await getDevicePushToken();
  if (!token) return false;

  const stored = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
  if (stored === token) {
    await registerPushTokenOnServer(token, Platform.OS);
    return true;
  }

  const ok = await registerPushTokenOnServer(token, Platform.OS);
  if (ok) {
    await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
  }
  return ok;
}

export async function unregisterDevicePushToken(): Promise<void> {
  const token = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
  await unregisterPushTokenOnServer(token || undefined);
  await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
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
