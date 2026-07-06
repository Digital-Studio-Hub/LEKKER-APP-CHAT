import { apiRequest } from "@/lib/query-client";

export async function registerPushTokenOnServer(
  expoPushToken: string,
  platform?: string,
): Promise<boolean> {
  try {
    const res = await apiRequest("POST", "/api/push/register", {
      expoPushToken,
      platform,
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function unregisterPushTokenOnServer(expoPushToken?: string): Promise<void> {
  try {
    await apiRequest("DELETE", "/api/push/register", expoPushToken ? { expoPushToken } : undefined);
  } catch {
    // ignore
  }
}