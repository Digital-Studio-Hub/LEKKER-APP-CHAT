import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import {
  registerPushTokenOnServer,
  unregisterPushTokenOnServer,
} from "@/lib/push-api";

const NOTIF_KEY = "lekker_notifications_enabled";
const PUSH_TOKEN_KEY = "lekker_expo_push_token";

let Notifications: typeof import("expo-notifications") | null = null;

let androidChannelReady = false;

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
    // High-importance channels for heads-up + closed-app delivery on Android
    if (Platform.OS === "android" && !androidChannelReady) {
      const channels: Array<{ id: string; name: string }> = [
        { id: "messages", name: "Messages" },
        { id: "enquiries", name: "Enquiries" },
        { id: "companion", name: "Companion care" },
        { id: "schedule", name: "Schedule & Meet" },
        { id: "workspace", name: "Workspace updates" },
      ];
      for (const ch of channels) {
        await Notifications.setNotificationChannelAsync(ch.id, {
          name: ch.name,
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: "#F5B800",
          sound: "default",
        });
      }
      androidChannelReady = true;
    }
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

  // OS permission is the source of truth. Older builds required a local flag that
  // was only set after Settings → Notifications, so login/foreground re-register
  // never saved Expo tokens → zero push_tokens in prod → no instant DMs.
  const stored = await AsyncStorage.getItem(NOTIF_KEY);
  if (stored !== "true") {
    await AsyncStorage.setItem(NOTIF_KEY, "true");
  }
  return true;
}

export async function disableNotifications(): Promise<void> {
  await AsyncStorage.removeItem(NOTIF_KEY);
  await unregisterDevicePushToken();
}

/** Hardcoded fallback — Constants sometimes omit extra.eas in release builds. */
const EAS_PROJECT_ID_FALLBACK = "385aa478-8c87-4480-b7b6-2ecb4addc68c";

async function getExpoProjectId(): Promise<string | undefined> {
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId ??
    EAS_PROJECT_ID_FALLBACK;
  if (!projectId || projectId === "lekker-chat") return undefined;
  return projectId;
}

async function reportPushDiag(payload: Record<string, unknown>): Promise<void> {
  try {
    const { apiRequest } = await import("@/lib/query-client");
    await apiRequest("POST", "/api/push/diag", payload);
  } catch {
    /* best-effort */
  }
}

export async function getDevicePushToken(): Promise<string | null> {
  if (Platform.OS === "web") return null;

  const N = await getNotifications();
  if (!N) {
    await reportPushDiag({ stage: "import", ok: false, error: "expo-notifications unavailable" });
    return null;
  }

  const projectId = await getExpoProjectId();
  if (!projectId) {
    console.warn("[Push] EAS projectId not configured — run eas init");
    await reportPushDiag({ stage: "projectId", ok: false, error: "missing projectId" });
    return null;
  }

  try {
    const tokenData = await N.getExpoPushTokenAsync({ projectId });
    return tokenData.data;
  } catch (e: any) {
    const msg = String(e?.message || e);
    console.error("[Push] getExpoPushTokenAsync failed:", msg);
    await reportPushDiag({
      stage: "getExpoPushTokenAsync",
      ok: false,
      projectId,
      error: msg.slice(0, 500),
      platform: Platform.OS,
    });
    return null;
  }
}

export async function registerDevicePushToken(): Promise<boolean> {
  if (Platform.OS === "web") return false;

  const N = await getNotifications();
  if (!N) return false;

  let { status, canAskAgain } = await N.getPermissionsAsync();
  if (status !== "granted") {
    // Prompt once when we can — closed-app DMs depend on this.
    if (canAskAgain === false) {
      await reportPushDiag({ stage: "permission", ok: false, error: "denied_permanent", status });
      return false;
    }
    const req = await N.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== "granted") {
    await reportPushDiag({ stage: "permission", ok: false, error: "not_granted", status });
    return false;
  }
  await AsyncStorage.setItem(NOTIF_KEY, "true");

  const token = await getDevicePushToken();
  if (!token) return false;

  const ok = await registerPushTokenOnServer(token, Platform.OS);
  if (ok) {
    await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
    await reportPushDiag({
      stage: "register",
      ok: true,
      platform: Platform.OS,
      tokenPrefix: token.slice(0, 24),
    });
  } else {
    console.warn("[Push] server rejected token registration");
    await reportPushDiag({ stage: "register", ok: false, error: "server_rejected" });
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

/** Alias used by older call-sites — same storage as registerDevicePushToken */
export async function getExpoPushToken(): Promise<string | null> {
  const cached = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
  if (cached) return cached;
  return getDevicePushToken();
}

export async function clearStoredPushToken(): Promise<string | null> {
  const token = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
  await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
  return token;
}
