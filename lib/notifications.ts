import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";

const NOTIF_KEY = "lekker_notifications_enabled";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === "web") {
    await AsyncStorage.setItem(NOTIF_KEY, "true");
    return true;
  }

  const { status: existingStatus, canAskAgain } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    if (!canAskAgain) {
      return false;
    }
    const { status } = await Notifications.requestPermissionsAsync();
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

  const { status } = await Notifications.getPermissionsAsync();
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
  const { canAskAgain, status } = await Notifications.getPermissionsAsync();
  return status !== "granted" && canAskAgain !== false;
}

export async function sendLocalNotification(title: string, body: string, data?: Record<string, string>) {
  if (Platform.OS === "web") return;

  try {
    const enabled = await areNotificationsEnabled();
    if (!enabled) return;

    await Notifications.scheduleNotificationAsync({
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
    await Notifications.setBadgeCountAsync(count);
  } catch (e) {}
}
