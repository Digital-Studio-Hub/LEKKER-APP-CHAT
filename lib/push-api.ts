import { getApiUrl } from "@/lib/query-client";
import { getAuthToken } from "@/lib/auth-token";

export async function registerPushToken(token: string, deviceId?: string): Promise<void> {
  const baseUrl = getApiUrl();
  const authToken = getAuthToken();
  if (!authToken || !token) return;
  try {
    await fetch(`${baseUrl}api/push/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ token, deviceId }),
    });
  } catch (e) {
    console.warn("[Push] Failed to register token:", e);
  }
}

export async function unregisterPushToken(token: string): Promise<void> {
  const baseUrl = getApiUrl();
  const authToken = getAuthToken();
  if (!authToken || !token) return;
  try {
    await fetch(`${baseUrl}api/push/register`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ token }),
    });
  } catch (e) {
    console.warn("[Push] Failed to unregister token:", e);
  }
}
