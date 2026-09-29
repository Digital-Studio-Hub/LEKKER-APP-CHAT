import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_CHAT_PROFILES,
  bindingFromUser,
  cledwynMessagesKey,
  cledwynSessionKey,
  legacyKeysToMigrate,
  networkSessionTokenBody,
  networkSessionTokenBodyFallback,
  parseDefaultWorkspaceId,
  planProfileSwitch,
  profileMetaFromAuthUser,
  profileTokenKey,
  removeProfile,
  upsertProfile,
  type ChatProfileMeta,
} from "./chat-profile.ts";

function user(id: string, phone: string, workspace: string | null = null): ChatProfileMeta {
  return profileMetaFromAuthUser(
    {
      id,
      phone,
      firstName: id === "a" ? "Ada" : "Bea",
      lastName: "Example",
      lekkerWorkspaceId: workspace,
      lekkerNetworkId: workspace ? `net-${id}` : null,
    },
    { isPrimary: id === "a", addedAt: "2026-01-01T00:00:00.000Z" },
  );
}

test("single-profile upsert keeps one primary and the phone binding", () => {
  const first = upsertProfile([], user("a", "+27111111111", "ws-personal"));
  assert.equal(first.error, undefined);
  assert.equal(first.profiles.length, 1);
  assert.equal(first.profiles[0].isPrimary, true);
  assert.equal(first.profiles[0].defaultWorkspaceId, "ws-personal");
  assert.equal(first.profiles[0].phone, "+27111111111");
});

test("a third profile is stored the same way as the second", () => {
  const first = upsertProfile([], user("a", "+27111111111", "ws-personal"));
  const second = upsertProfile(first.profiles, user("b", "+27222222222", "ws-business"));
  const third = upsertProfile(second.profiles, user("c", "+27333333333", "ws-studio"));
  assert.equal(third.error, undefined);
  assert.equal(third.profiles.length, 3);
  assert.equal(third.profiles.filter((p) => p.isPrimary).length, 1);
  assert.equal(third.profiles[0].isPrimary, true);
  assert.equal(third.profiles[1].defaultWorkspaceId, "ws-business");
  assert.equal(third.profiles[2].phone, "+27333333333");
  assert.equal(third.profiles[2].defaultWorkspaceId, "ws-studio");
  assert.notEqual(cledwynMessagesKey("a"), cledwynMessagesKey("c"));
  assert.notEqual(profileTokenKey("b"), profileTokenKey("c"));
});

test("device cap is above two and still rejects one past the limit", () => {
  assert.ok(MAX_CHAT_PROFILES >= 5);
  let profiles = [] as ReturnType<typeof user>[];
  for (let i = 0; i < MAX_CHAT_PROFILES; i++) {
    const added = upsertProfile(profiles, user(`p${i}`, `+27000000${i}`, `ws-${i}`));
    assert.equal(added.error, undefined);
    profiles = added.profiles;
  }
  assert.equal(profiles.length, MAX_CHAT_PROFILES);
  assert.equal(profiles.filter((p) => p.isPrimary).length, 1);
  const overflow = upsertProfile(profiles, user("overflow", "+27999999999", "ws-overflow"));
  assert.match(overflow.error || "", new RegExp(String(MAX_CHAT_PROFILES)));
  assert.equal(overflow.profiles.length, MAX_CHAT_PROFILES);
  const refreshed = upsertProfile(profiles, user("p0", "+270000000", "ws-0"));
  assert.equal(refreshed.error, undefined);
  assert.equal(refreshed.profiles.length, MAX_CHAT_PROFILES);
});

test("re-verifying an existing number refreshes binding without duplicating", () => {
  const first = upsertProfile([], user("a", "+27111111111", "ws-personal"));
  const again = upsertProfile(
    first.profiles,
    profileMetaFromAuthUser(
      {
        id: "a",
        phone: "+27111111111",
        firstName: "Ada",
        lastName: "Updated",
        lekkerWorkspaceId: "ws-personal",
        lekkerNetworkId: "net-a",
      },
      { label: "Personal", addedAt: "2026-09-01T00:00:00.000Z" },
    ),
  );
  assert.equal(again.profiles.length, 1);
  assert.equal(again.profiles[0].displayName, "Ada Updated");
  assert.equal(again.profiles[0].label, "Personal");
  assert.equal(again.profiles[0].addedAt, "2026-01-01T00:00:00.000Z");
  assert.equal(again.profiles[0].isPrimary, true);
});

test("switch plan isolates tokens, cledwyn memory, and push registration", () => {
  const same = planProfileSwitch("a", "a");
  assert.equal(same.ok, false);
  if (!same.ok) assert.equal(same.unchanged, true);

  const plan = planProfileSwitch("a", "b");
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.equal(plan.unregisterPushForPrevious, true);
  assert.equal(plan.registerPushForNext, true);
  assert.equal(plan.clearQueryCache, true);
  assert.notEqual(plan.tokenKeyFrom, plan.tokenKeyTo);
  assert.notEqual(plan.cledwynMessagesFrom, plan.cledwynMessagesTo);
  assert.notEqual(plan.cledwynSessionFrom, plan.cledwynSessionTo);
  assert.equal(plan.tokenKeyTo, profileTokenKey("b"));
  assert.equal(plan.cledwynMessagesTo, cledwynMessagesKey("b"));
  assert.equal(plan.cledwynSessionTo, cledwynSessionKey("b"));
  assert.equal(plan.cledwynMessagesFrom?.endsWith("__a"), true);
  assert.equal(plan.cledwynMessagesTo.endsWith("__b"), true);
  assert.equal(plan.cledwynSessionTo.endsWith("__b"), true);
});

test("removing the active profile activates the one that remains", () => {
  const profiles = upsertProfile(
    upsertProfile([], user("a", "+27111111111", "ws-personal")).profiles,
    user("b", "+27222222222", "ws-business"),
  ).profiles;
  const removed = removeProfile({ profiles, activeProfileId: "b" }, "b");
  assert.equal(removed.signedOutCompletely, false);
  assert.equal(removed.vault.activeProfileId, "a");
  assert.equal(removed.vault.profiles.length, 1);

  const last = removeProfile(removed.vault, "a");
  assert.equal(last.signedOutCompletely, true);
  assert.equal(last.vault.activeProfileId, null);
  assert.deepEqual(last.vault.profiles, []);
});

test("binding contract and workspace id parsing", () => {
  const binding = bindingFromUser({
    id: "a",
    phone: "+27111111111",
    lekkerWorkspaceId: "ws-personal",
    lekkerNetworkId: "net-a",
  });
  assert.deepEqual(binding, {
    profileId: "a",
    phone: "+27111111111",
    defaultWorkspaceId: "ws-personal",
    lekkerNetworkId: "net-a",
    networkMembershipsAvailable: false,
    memberships: [],
  });
  assert.deepEqual(parseDefaultWorkspaceId("ws_business-1"), { ok: true, value: "ws_business-1" });
  assert.deepEqual(parseDefaultWorkspaceId(""), { ok: true, value: null });
  assert.equal(parseDefaultWorkspaceId("bad id").ok, false);
  assert.equal(parseDefaultWorkspaceId("../etc").ok, false);
});

test("network session body carries profile binding and can fall back to userId only", () => {
  assert.deepEqual(
    networkSessionTokenBody({
      lekkerNetworkId: "net-b",
      workspaceId: "ws-business",
      profileId: "b",
      phone: "+27222222222",
    }),
    {
      userId: "net-b",
      workspaceId: "ws-business",
      chatProfileId: "b",
      phone: "+27222222222",
    },
  );
  assert.deepEqual(networkSessionTokenBodyFallback("net-b"), { userId: "net-b" });
});

test("legacy single-profile keys migrate onto the primary profile only", () => {
  const pairs = legacyKeysToMigrate("primary-id");
  assert.equal(pairs.length, 3);
  for (const pair of pairs) {
    assert.notEqual(pair.from, pair.to);
    assert.equal(pair.to.includes("primary-id"), true);
    assert.equal(pair.from.includes("primary-id"), false);
  }
  const other = legacyKeysToMigrate("other-id");
  assert.notEqual(pairs[0].to, other[0].to);
});
