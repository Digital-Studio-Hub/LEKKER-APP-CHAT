import { getApiUrl } from "@/lib/query-client";
import { getAuthToken } from "@/lib/auth-token";

/**
 * Register this device's Expo push token with the Chat API.
 * Returns true when the server accepted the token.
 */
export async function registerPushToken(
  token: string,
  platform?: string,
): Promise<boolean> {
  const baseUrl = getApiUrl();
  const authToken = getAuthToken();
  if (!authToken || !token) return false;
  try {
    const res = await fetch(`${baseUrl}api/push/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      // Server accepts `token` + optional `platform` / `deviceId`
      body: JSON.stringify({
        token,
        platform: platform || undefined,
        deviceId: platform || undefined,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn("[Push] register failed:", res.status, text);
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[Push] Failed to register token:", e);
    return false;
  }
}

/** Alias used by notifications.ts */
export const registerPushTokenOnServer = registerPushToken;

export async function unregisterPushToken(token?: string): Promise<boolean> {
  const baseUrl = getApiUrl();
  const authToken = getAuthToken();
  if (!authToken) return false;
  try {
    const res = await fetch(`${baseUrl}api/push/register`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ token: token || undefined }),
    });
    return res.ok;
  } catch (e) {
    console.warn("[Push] Failed to unregister token:", e);
    return false;
  }
}

/** Alias used by notifications.ts */
export const unregisterPushTokenOnServer = unregisterPushToken;
