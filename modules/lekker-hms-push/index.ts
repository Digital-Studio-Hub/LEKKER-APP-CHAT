import { requireNativeModule } from "expo-modules-core";
import { Platform } from "react-native";

export type GmsStatus = "available" | "unavailable" | "unknown";

type LekkerHmsNative = {
  googlePlayServicesStatus(): Promise<string>;
  getHmsToken(appId: string | null): Promise<string | null>;
};

let native: LekkerHmsNative | null | undefined;

function getNative(): LekkerHmsNative | null {
  if (Platform.OS !== "android") return null;
  if (native !== undefined) return native;
  try {
    native = requireNativeModule<LekkerHmsNative>("LekkerHmsPush");
  } catch {
    native = null;
  }
  return native;
}

export async function googlePlayServicesStatus(): Promise<GmsStatus> {
  const mod = getNative();
  if (!mod) return "unknown";
  try {
    const status = await mod.googlePlayServicesStatus();
    if (status === "available" || status === "unavailable") return status;
    return "unknown";
  } catch {
    return "unknown";
  }
}

/** Returns null when HMS Core, the app id, or the native module is unavailable. */
export async function getHmsPushToken(appId: string | null): Promise<string | null> {
  const mod = getNative();
  if (!mod) return null;
  try {
    const token = await mod.getHmsToken(appId && appId.trim() ? appId.trim() : null);
    if (typeof token !== "string") return null;
    const trimmed = token.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}
