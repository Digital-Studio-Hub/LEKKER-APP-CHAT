import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import {
  ACTIVE_PROFILE_KEY,
  LEGACY_TOKEN_KEY,
  PROFILE_INDEX_KEY,
  PROFILE_LEGACY_MIGRATED_KEY,
  emptyVault,
  legacyKeysToMigrate,
  profileTokenKey,
  type ChatProfileMeta,
  type ProfileVault,
} from "@shared/chat-profile";

let memoryActiveId: string | null = null;

export function getActiveProfileId(): string | null {
  return memoryActiveId;
}

export function setActiveProfileId(id: string | null) {
  memoryActiveId = id;
}

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

function isProfile(value: unknown): value is ChatProfileMeta {
  if (!value || typeof value !== "object") return false;
  const row = value as ChatProfileMeta;
  return typeof row.profileId === "string" && typeof row.phone === "string";
}

export async function loadVault(): Promise<ProfileVault> {
  try {
    const raw = await AsyncStorage.getItem(PROFILE_INDEX_KEY);
    const activeRaw = await AsyncStorage.getItem(ACTIVE_PROFILE_KEY);
    let profiles: ChatProfileMeta[] = [];
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) profiles = parsed.filter(isProfile);
    }
    const activeProfileId =
      (activeRaw && profiles.some((p) => p.profileId === activeRaw) && activeRaw) ||
      profiles.find((p) => p.isPrimary)?.profileId ||
      profiles[0]?.profileId ||
      null;
    memoryActiveId = activeProfileId;
    return { profiles, activeProfileId };
  } catch {
    memoryActiveId = null;
    return emptyVault();
  }
}

export async function saveVault(vault: ProfileVault): Promise<void> {
  memoryActiveId = vault.activeProfileId;
  await AsyncStorage.setItem(PROFILE_INDEX_KEY, JSON.stringify(vault.profiles));
  if (vault.activeProfileId) {
    await AsyncStorage.setItem(ACTIVE_PROFILE_KEY, vault.activeProfileId);
  } else {
    await AsyncStorage.removeItem(ACTIVE_PROFILE_KEY);
  }
}

export async function clearVault(): Promise<void> {
  memoryActiveId = null;
  await AsyncStorage.multiRemove([PROFILE_INDEX_KEY, ACTIVE_PROFILE_KEY]);
}

export async function saveProfileToken(profileId: string, token: string): Promise<void> {
  await secureSet(profileTokenKey(profileId), token);
}

export async function readProfileToken(profileId: string): Promise<string | null> {
  return secureGet(profileTokenKey(profileId));
}

export async function deleteProfileToken(profileId: string): Promise<void> {
  await secureDelete(profileTokenKey(profileId));
}

/**
 * Move unscoped Cledwyn / personal-care blobs onto the original profile once.
 * Later profiles must not inherit them.
 */
export async function migrateLegacyLocalData(profileId: string): Promise<void> {
  const flag = await AsyncStorage.getItem(PROFILE_LEGACY_MIGRATED_KEY);
  if (flag) return;
  for (const pair of legacyKeysToMigrate(profileId)) {
    const already = await AsyncStorage.getItem(pair.to);
    if (already) continue;
    const legacy = await AsyncStorage.getItem(pair.from);
    if (!legacy) continue;
    await AsyncStorage.setItem(pair.to, legacy);
    await AsyncStorage.removeItem(pair.from);
  }
  const legacyToken = await secureGet(LEGACY_TOKEN_KEY);
  const scoped = await readProfileToken(profileId);
  if (legacyToken && !scoped) {
    await saveProfileToken(profileId, legacyToken);
  }
  await AsyncStorage.setItem(PROFILE_LEGACY_MIGRATED_KEY, profileId);
}

/** Personal PIN / recovery hashes. Legacy values move only onto the migrated primary profile. */
export async function personalSecretKey(base: string, profileId: string | null): Promise<string> {
  if (!profileId) return base;
  const scoped = `${base}__${profileId.replace(/[^a-zA-Z0-9._-]/g, "")}`;
  const current = await secureGet(scoped);
  if (current) return scoped;
  const flag = await AsyncStorage.getItem(PROFILE_LEGACY_MIGRATED_KEY);
  if (flag === profileId) {
    const legacy = await secureGet(base);
    if (legacy) {
      await secureSet(scoped, legacy);
      await secureDelete(base);
      return scoped;
    }
  }
  return scoped;
}
