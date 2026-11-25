import { EventEmitter, requireNativeModule } from "expo-modules-core";
import { Platform } from "react-native";

export type GmsStatus = "available" | "unavailable" | "unknown";

type LekkerHmsNative = {
  googlePlayServicesStatus(): Promise<string>;
  getHmsToken(appId: string | null): Promise<string | null>;
  peekPendingHmsToken(): string | null;
  clearPendingHmsToken(): void;
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

function readToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Token saved by HmsMessageService.onNewToken, if JS has not registered it yet. */
export function peekPendingHmsToken(): string | null {
  const mod = getNative();
  if (!mod) return null;
  try {
    return readToken(mod.peekPendingHmsToken());
  } catch {
    return null;
  }
}

export function clearPendingHmsToken(): void {
  const mod = getNative();
  if (!mod) return;
  try {
    mod.clearPendingHmsToken();
  } catch {
    /* native module missing or already cleared */
  }
}

/** Fires when Huawei rotates a token or delivers one after getToken returned empty. */
export function subscribeHmsTokenRefresh(onToken: (token: string) => void): () => void {
  const mod = getNative();
  if (!mod) return () => {};
  try {
    const emitter = new EventEmitter(mod);
    const subscription = emitter.addListener("onNewToken", (event: { token?: string }) => {
      const token = readToken(event?.token);
      if (token) onToken(token);
    });
    return () => subscription.remove();
  } catch {
    return () => {};
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
