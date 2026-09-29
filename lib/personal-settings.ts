import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { apiRequest } from "@/lib/query-client";
import { getActiveProfileId, personalSecretKey } from "@/lib/profile-store";
import { personalCareCacheKey } from "@shared/chat-profile";

const PIN_HASH_KEY = "lekker_personal_pin_hash";
const RECOVERY_HASH_KEY = "lekker_personal_recovery_hash";
const UNLOCK_SESSION_KEY = "lekker_personal_unlocked_at";
const LOCAL_CACHE_KEY = "lekker_personal_care_cache";
const MAX_PIN_ATTEMPTS = 5;
const LOCKOUT_MS = 60_000;
const SESSION_TTL_MS = 15 * 60 * 1000;

export const CHECK_IN_INTERVAL_PRESETS = [2, 4, 6, 8, 12] as const;
export const SILENCE_ALERT_PRESETS = [1, 2, 4, 8, 12, 24] as const;

const pinAttemptsByProfile = new Map<string, { attempts: number; lockoutUntil: number }>();

function attemptState() {
  const id = getActiveProfileId() || "default";
  let row = pinAttemptsByProfile.get(id);
  if (!row) {
    row = { attempts: 0, lockoutUntil: 0 };
    pinAttemptsByProfile.set(id, row);
  }
  return row;
}

export type PersonalCarePrefs = {
  safeBrowseEnabled: boolean;
  companionEnabled: boolean;
  companionProfile: string;
  checkInIntervalHours: number;
  silenceAlertAfterHours: number;
  familyContactUserId: string | null;
  lastPatientReplyAt?: string | null;
  lastCheckInSentAt?: string | null;
  lastFamilyAlertSentAt?: string | null;
};

export const DEFAULT_PERSONAL_CARE: PersonalCarePrefs = {
  safeBrowseEnabled: false,
  companionEnabled: false,
  companionProfile: "dementia",
  checkInIntervalHours: 4,
  silenceAlertAfterHours: 4,
  familyContactUserId: null,
};

async function secureGet(key: string): Promise<string | null> {
  if (Platform.OS === "web") return AsyncStorage.getItem(key);
  return SecureStore.getItemAsync(key);
}

async function secureSet(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    await AsyncStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function secureDelete(key: string): Promise<void> {
  if (Platform.OS === "web") {
    await AsyncStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

async function hashSecret(value: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `lekker-personal:${value}`);
}

function randomRecoveryCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

async function pinKey(): Promise<string> {
  return personalSecretKey(PIN_HASH_KEY, getActiveProfileId());
}

async function recoveryKey(): Promise<string> {
  return personalSecretKey(RECOVERY_HASH_KEY, getActiveProfileId());
}

function careCacheKey(): string {
  const id = getActiveProfileId();
  return id ? personalCareCacheKey(id) : LOCAL_CACHE_KEY;
}

function unlockKey(): string {
  const id = getActiveProfileId();
  return id ? `${UNLOCK_SESSION_KEY}__${id}` : UNLOCK_SESSION_KEY;
}

export async function hasPersonalPin(): Promise<boolean> {
  const hash = await secureGet(await pinKey());
  return !!hash;
}

export async function setPersonalPin(pin: string): Promise<{ recoveryCode: string }> {
  const cleaned = pin.replace(/\D/g, "");
  if (cleaned.length < 4 || cleaned.length > 6) {
    throw new Error("PIN must be 4–6 digits");
  }
  const recoveryCode = randomRecoveryCode();
  await secureSet(await pinKey(), await hashSecret(cleaned));
  await secureSet(await recoveryKey(), await hashSecret(recoveryCode.toUpperCase()));
  const state = attemptState();
  state.attempts = 0;
  state.lockoutUntil = 0;
  await markPersonalUnlocked();
  return { recoveryCode };
}

export async function verifyPersonalPin(pin: string): Promise<boolean> {
  const state = attemptState();
  if (Date.now() < state.lockoutUntil) {
    throw new Error("Too many attempts. Try again in a minute.");
  }
  const hash = await secureGet(await pinKey());
  if (!hash) return false;
  const cleaned = pin.replace(/\D/g, "");
  const ok = (await hashSecret(cleaned)) === hash;
  if (!ok) {
    state.attempts += 1;
    if (state.attempts >= MAX_PIN_ATTEMPTS) {
      state.lockoutUntil = Date.now() + LOCKOUT_MS;
      state.attempts = 0;
      throw new Error("Too many attempts. Try again in a minute.");
    }
    return false;
  }
  state.attempts = 0;
  await markPersonalUnlocked();
  return true;
}

export async function resetPersonalPinWithRecovery(recoveryCode: string, newPin: string): Promise<void> {
  const stored = await secureGet(await recoveryKey());
  if (!stored) throw new Error("No recovery code on this device");
  const ok = (await hashSecret(recoveryCode.trim().toUpperCase())) === stored;
  if (!ok) throw new Error("Recovery code incorrect");
  await setPersonalPin(newPin);
}

async function markPersonalUnlocked(): Promise<void> {
  await AsyncStorage.setItem(unlockKey(), String(Date.now()));
}

export async function isPersonalUnlocked(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(unlockKey());
  if (!raw) return false;
  const at = Number(raw);
  if (!Number.isFinite(at)) return false;
  return Date.now() - at < SESSION_TTL_MS;
}

export async function lockPersonalSettings(): Promise<void> {
  await AsyncStorage.removeItem(unlockKey());
}

export async function cachePersonalCare(prefs: PersonalCarePrefs): Promise<void> {
  await AsyncStorage.setItem(careCacheKey(), JSON.stringify(prefs));
}

export async function getCachedPersonalCare(): Promise<PersonalCarePrefs> {
  try {
    const raw = await AsyncStorage.getItem(careCacheKey());
    if (!raw) return { ...DEFAULT_PERSONAL_CARE };
    return { ...DEFAULT_PERSONAL_CARE, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_PERSONAL_CARE };
  }
}

export async function fetchPersonalCare(): Promise<PersonalCarePrefs> {
  const res = await apiRequest("GET", "/api/personal/settings");
  const data = await res.json();
  const prefs: PersonalCarePrefs = {
    ...DEFAULT_PERSONAL_CARE,
    ...(data.settings || data),
  };
  await cachePersonalCare(prefs);
  return prefs;
}

export async function savePersonalCare(patch: Partial<PersonalCarePrefs>): Promise<PersonalCarePrefs> {
  const res = await apiRequest("PUT", "/api/personal/settings", patch);
  const data = await res.json();
  const prefs: PersonalCarePrefs = {
    ...DEFAULT_PERSONAL_CARE,
    ...(data.settings || data),
  };
  await cachePersonalCare(prefs);
  return prefs;
}

export async function reportPatientActivity(): Promise<void> {
  try {
    await apiRequest("POST", "/api/personal/patient-activity", {});
  } catch {
    /* offline — cron uses last known */
  }
}

/** Google SafeSearch-friendly search URL. */
export function googleSearchUrl(query: string, safeBrowse: boolean): string {
  const q = encodeURIComponent(query);
  if (safeBrowse) {
    return `https://www.google.com/search?q=${q}&safe=active&ssui=on`;
  }
  return `https://www.google.com/search?q=${q}`;
}
