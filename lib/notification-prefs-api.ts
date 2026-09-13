import { apiRequest } from "@/lib/query-client";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_CATEGORY_META,
  type NotificationPreferences,
  type NotificationCategory,
} from "@shared/notification-prefs";

export {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_CATEGORY_META,
  type NotificationPreferences,
  type NotificationCategory,
};

export async function fetchNotificationPreferences(): Promise<{
  notificationsEnabled: boolean;
  preferences: NotificationPreferences;
}> {
  try {
    const res = await apiRequest("GET", "/api/notifications/preferences");
    const data = await res.json();
    return {
      notificationsEnabled: data.notificationsEnabled !== false,
      preferences: {
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        ...(data.preferences || {}),
      },
    };
  } catch {
    return {
      notificationsEnabled: true,
      preferences: { ...DEFAULT_NOTIFICATION_PREFERENCES },
    };
  }
}

export async function saveNotificationPreferences(
  patch: Partial<NotificationPreferences>,
): Promise<NotificationPreferences> {
  const res = await apiRequest("PUT", "/api/notifications/preferences", {
    preferences: patch,
  });
  const data = await res.json();
  return {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    ...(data.preferences || patch),
  };
}
