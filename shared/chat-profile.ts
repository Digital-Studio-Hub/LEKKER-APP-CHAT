/**
 * Multi-profile model for Lekker Chat.
 *
 * One install keeps a primary WhatsApp-number profile and can add more verified
 * numbers. Each profile is a separate Chat user with its own JWT.
 * This module is pure (no I/O) so the vault rules can be tested without React Native.
 *
 * Soft device cap (not a two-number product rule): each profile stores its own
 * session token, and the switch list has to stay usable on a phone. Ten covers
 * personal, business, and extra lines. Raise this constant if a real install needs more.
 */

export const MAX_CHAT_PROFILES = 10;

/** Generic labels a person can apply. Not customer or workspace identifiers. */
export const PROFILE_LABEL_SUGGESTIONS = ["Personal", "Business"] as const;

export const PROFILE_INDEX_KEY = "lekker_profiles_index";
export const ACTIVE_PROFILE_KEY = "lekker_active_profile_id";
export const LEGACY_TOKEN_KEY = "lekker_auth_token";
export const LEGACY_USER_KEY = "lekker_auth_user";
export const LEGACY_CLEDWYN_MESSAGES_KEY = "lekker_cledwyn_messages";
export const LEGACY_CLEDWYN_SESSION_KEY = "lekker_cledwyn_network_session";
export const LEGACY_PERSONAL_CARE_CACHE_KEY = "lekker_personal_care_cache";
export const PROFILE_LEGACY_MIGRATED_KEY = "lekker_profile_legacy_migrated";

export type ChatProfileMeta = {
  profileId: string;
  phone: string;
  displayName: string;
  /** Local label such as Personal or Business. */
  label: string | null;
  defaultWorkspaceId: string | null;
  lekkerNetworkId: string | null;
  isPrimary: boolean;
  addedAt: string;
};

export type ProfileVault = {
  activeProfileId: string | null;
  profiles: ChatProfileMeta[];
};

/** Contract shared with lekker.network. Memberships are filled when Network supplies them. */
export type ProfileBinding = {
  profileId: string;
  phone: string;
  defaultWorkspaceId: string | null;
  lekkerNetworkId: string | null;
  networkMembershipsAvailable: boolean;
  memberships: Array<{ id: string; name?: string | null; role?: string | null }>;
};

export type AuthUserLike = {
  id: string;
  phone: string;
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  businessName?: string | null;
  username?: string | null;
  lekkerWorkspaceId?: string | null;
  lekkerNetworkId?: string | null;
};

const WORKSPACE_ID_RE = /^[A-Za-z0-9_-]{1,100}$/;

export function scopedStorageKey(base: string, profileId: string): string {
  return `${base}__${profileId}`;
}

export function profileTokenKey(profileId: string): string {
  const safe = profileId.replace(/[^a-zA-Z0-9._-]/g, "");
  if (!safe) {
    throw new Error("invalid profile id");
  }
  return `lekker_pt_${safe}`;
}

export function cledwynMessagesKey(profileId: string): string {
  return scopedStorageKey(LEGACY_CLEDWYN_MESSAGES_KEY, profileId);
}

export function cledwynSessionKey(profileId: string): string {
  return scopedStorageKey(LEGACY_CLEDWYN_SESSION_KEY, profileId);
}

export function personalCareCacheKey(profileId: string): string {
  return scopedStorageKey(LEGACY_PERSONAL_CARE_CACHE_KEY, profileId);
}

export function normalizeProfileLabel(label: string | null | undefined): string | null {
  if (typeof label !== "string") return null;
  const trimmed = label.replace(/[\u0000-\u001F]/g, "").trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 40);
}

export function profileMetaFromAuthUser(
  user: AuthUserLike,
  opts?: { isPrimary?: boolean; label?: string | null; addedAt?: string },
): ChatProfileMeta {
  const combined = `${user.firstName || ""} ${user.lastName || ""}`.trim();
  const displayName = (
    user.displayName ||
    combined ||
    user.businessName ||
    user.username ||
    user.phone ||
    "Profile"
  ).trim();
  return {
    profileId: user.id,
    phone: user.phone,
    displayName,
    label: normalizeProfileLabel(opts?.label),
    defaultWorkspaceId: user.lekkerWorkspaceId || null,
    lekkerNetworkId: user.lekkerNetworkId || null,
    isPrimary: !!opts?.isPrimary,
    addedAt: opts?.addedAt || new Date().toISOString(),
  };
}

export function bindingFromUser(user: AuthUserLike): ProfileBinding {
  return {
    profileId: user.id,
    phone: user.phone,
    defaultWorkspaceId: user.lekkerWorkspaceId || null,
    lekkerNetworkId: user.lekkerNetworkId || null,
    networkMembershipsAvailable: false,
    memberships: [],
  };
}

/**
 * Accept a workspace id the client wants to pin, or null to clear the pin.
 * Network must still reject ids this user is not a member of.
 */
export function parseDefaultWorkspaceId(
  input: unknown,
): { ok: true; value: string | null } | { ok: false; message: string } {
  if (input === null || input === undefined || input === "") {
    return { ok: true, value: null };
  }
  if (typeof input !== "string") {
    return { ok: false, message: "defaultWorkspaceId must be a string or null" };
  }
  const value = input.trim();
  if (!WORKSPACE_ID_RE.test(value)) {
    return {
      ok: false,
      message: "defaultWorkspaceId must be 1–100 letters, numbers, _ or -",
    };
  }
  return { ok: true, value };
}

function withSinglePrimary(profiles: ChatProfileMeta[]): ChatProfileMeta[] {
  if (profiles.length === 0) return profiles;
  const primary = profiles.find((p) => p.isPrimary) || profiles[0];
  return profiles.map((p) => ({ ...p, isPrimary: p.profileId === primary.profileId }));
}

export function upsertProfile(
  profiles: ChatProfileMeta[],
  incoming: ChatProfileMeta,
): { profiles: ChatProfileMeta[]; error?: string } {
  const idx = profiles.findIndex((p) => p.profileId === incoming.profileId);
  if (idx >= 0) {
    const prev = profiles[idx];
    const next = profiles.slice();
    next[idx] = {
      ...prev,
      phone: incoming.phone || prev.phone,
      displayName: incoming.displayName || prev.displayName,
      label: incoming.label ?? prev.label,
      defaultWorkspaceId: incoming.defaultWorkspaceId ?? prev.defaultWorkspaceId,
      lekkerNetworkId: incoming.lekkerNetworkId ?? prev.lekkerNetworkId,
      isPrimary: prev.isPrimary || incoming.isPrimary,
      addedAt: prev.addedAt,
    };
    return { profiles: withSinglePrimary(next) };
  }
  if (profiles.length >= MAX_CHAT_PROFILES) {
    return {
      profiles,
      error: `This phone can keep ${MAX_CHAT_PROFILES} numbers. Remove one in Settings to add another.`,
    };
  }
  const isPrimary = profiles.length === 0 || (incoming.isPrimary && !profiles.some((p) => p.isPrimary));
  return {
    profiles: withSinglePrimary([...profiles, { ...incoming, isPrimary }]),
  };
}

export function removeProfile(
  vault: ProfileVault,
  profileId: string,
): { vault: ProfileVault; signedOutCompletely: boolean } {
  const profiles = withSinglePrimary(vault.profiles.filter((p) => p.profileId !== profileId));
  if (profiles.length === 0) {
    return { vault: { profiles: [], activeProfileId: null }, signedOutCompletely: true };
  }
  let active = vault.activeProfileId;
  if (!active || active === profileId || !profiles.some((p) => p.profileId === active)) {
    active = (profiles.find((p) => p.isPrimary) || profiles[0]).profileId;
  }
  return { vault: { profiles, activeProfileId: active }, signedOutCompletely: false };
}

export function emptyVault(): ProfileVault {
  return { profiles: [], activeProfileId: null };
}

export type ProfileSwitchPlan = {
  ok: true;
  unchanged: false;
  fromProfileId: string | null;
  toProfileId: string;
  unregisterPushForPrevious: boolean;
  registerPushForNext: true;
  clearQueryCache: true;
  reconnectRealtime: true;
  tokenKeyFrom: string | null;
  tokenKeyTo: string;
  cledwynMessagesFrom: string | null;
  cledwynMessagesTo: string;
  cledwynSessionFrom: string | null;
  cledwynSessionTo: string;
};

export function planProfileSwitch(
  fromId: string | null,
  toId: string,
): ProfileSwitchPlan | { ok: false; unchanged: boolean; message: string } {
  if (!toId) {
    return { ok: false, unchanged: false, message: "Profile is required" };
  }
  if (fromId === toId) {
    return { ok: false, unchanged: true, message: "Already on this profile" };
  }
  return {
    ok: true,
    unchanged: false,
    fromProfileId: fromId,
    toProfileId: toId,
    unregisterPushForPrevious: !!fromId,
    registerPushForNext: true,
    clearQueryCache: true,
    reconnectRealtime: true,
    tokenKeyFrom: fromId ? profileTokenKey(fromId) : null,
    tokenKeyTo: profileTokenKey(toId),
    cledwynMessagesFrom: fromId ? cledwynMessagesKey(fromId) : null,
    cledwynMessagesTo: cledwynMessagesKey(toId),
    cledwynSessionFrom: fromId ? cledwynSessionKey(fromId) : null,
    cledwynSessionTo: cledwynSessionKey(toId),
  };
}

/** Body for POST /api/v1/mobile/session-token. Extra fields are optional for Network. */
export function networkSessionTokenBody(input: {
  lekkerNetworkId: string;
  workspaceId?: string | null;
  profileId?: string | null;
  phone?: string | null;
}): Record<string, string> {
  const body: Record<string, string> = { userId: input.lekkerNetworkId };
  if (input.workspaceId) body.workspaceId = input.workspaceId;
  if (input.profileId) body.chatProfileId = input.profileId;
  if (input.phone) body.phone = input.phone;
  return body;
}

export function networkSessionTokenBodyFallback(lekkerNetworkId: string): { userId: string } {
  return { userId: lekkerNetworkId };
}

/** Keys whose legacy (unscoped) values belong to the original single profile. */
export function legacyKeysToMigrate(profileId: string): Array<{ from: string; to: string }> {
  return [
    { from: LEGACY_CLEDWYN_MESSAGES_KEY, to: cledwynMessagesKey(profileId) },
    { from: LEGACY_CLEDWYN_SESSION_KEY, to: cledwynSessionKey(profileId) },
    { from: LEGACY_PERSONAL_CARE_CACHE_KEY, to: personalCareCacheKey(profileId) },
  ];
}
