/**
 * Push provider selection and delivery routing.
 * Pure module: safe to import from the Expo client and the API server.
 *
 * Delivery:
 * - `hms` tokens go to Huawei Push Kit.
 * - `fcm`, `apns`, `expo`, and unknown/legacy rows go to the Expo push service
 *   (FCM on Android with Google Mobile Services, APNs on iOS).
 */

export type PushProvider = "fcm" | "hms" | "apns" | "expo";

export type GmsAvailability = "available" | "unavailable" | "unknown";

export type DeliveryChannel = "hms" | "expo";

const PROVIDERS: ReadonlySet<string> = new Set(["fcm", "hms", "apns", "expo"]);

export function normalisePushProvider(provider: string | null | undefined): PushProvider {
  const value = typeof provider === "string" ? provider.trim().toLowerCase() : "";
  if (PROVIDERS.has(value)) return value as PushProvider;
  return "expo";
}

export function deliveryChannel(provider: string | null | undefined): DeliveryChannel {
  return normalisePushProvider(provider) === "hms" ? "hms" : "expo";
}

/**
 * Which token to ask the device for.
 * Android with GMS keeps the Expo/FCM path. Android without GMS uses HMS only.
 * If GMS cannot be detected, try FCM first and HMS only when that returns nothing.
 */
export function pushAcquisitionPlan(platform: string, gms: GmsAvailability): PushProvider[] {
  if (platform === "web") return [];
  if (platform === "ios") return ["apns"];
  if (platform === "android") {
    if (gms === "unavailable") return ["hms"];
    if (gms === "available") return ["fcm"];
    return ["fcm", "hms"];
  }
  return ["fcm"];
}

export type PushTokenRecord = {
  token: string;
  provider?: string | null;
};

export type PushDeliveryPlan = {
  expo: PushTokenRecord[];
  hms: PushTokenRecord[];
};

export function planPushDeliveries(tokens: PushTokenRecord[]): PushDeliveryPlan {
  const expo: PushTokenRecord[] = [];
  const hms: PushTokenRecord[] = [];
  for (const row of tokens) {
    if (typeof row.token !== "string" || row.token.length === 0) continue;
    if (deliveryChannel(row.provider) === "hms") hms.push(row);
    else expo.push(row);
  }
  return { expo, hms };
}
