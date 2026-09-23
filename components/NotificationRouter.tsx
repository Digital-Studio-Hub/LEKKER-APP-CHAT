import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { routeNotificationData } from "@/lib/notification-routing";

/**
 * Handles taps on push / local notifications once the navigation tree is ready.
 */
export function NotificationRouter() {
  const handledRef = useRef<string | null>(null);

  useEffect(() => {
    if (Platform.OS === "web") return;
    let sub: { remove: () => void } | undefined;
    let cancelled = false;

    (async () => {
      try {
        const Notifications = await import("expo-notifications");
        const last = await Notifications.getLastNotificationResponseAsync();
        if (!cancelled && last?.notification) {
          const id = last.notification.request.identifier;
          if (handledRef.current !== id) {
            handledRef.current = id;
            routeNotificationData(
              (last.notification.request.content.data || {}) as Record<string, unknown>,
            );
          }
        }
        sub = Notifications.addNotificationResponseReceivedListener((response) => {
          routeNotificationData(
            (response.notification.request.content.data || {}) as Record<string, unknown>,
          );
        });
      } catch (e) {
        console.warn("[NotificationRouter]", e);
      }
    })();

    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, []);

  return null;
}
