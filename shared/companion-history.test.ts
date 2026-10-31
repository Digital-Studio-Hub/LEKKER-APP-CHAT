import test from "node:test";
import assert from "node:assert/strict";
import {
  COMPANION_CHAT_SOURCE,
  COMPANION_HISTORY_LIMIT,
  COMPANION_REQUIRED_MESSAGE,
  EMERGENCY_ALERT_GAP_MESSAGE,
  EMERGENCY_ALERT_HOURLY_CAP,
  EMERGENCY_ALERT_HOURLY_MESSAGE,
  EMERGENCY_ALERT_MIN_GAP_MS,
  EMERGENCY_ALERT_RELEASE_SQL,
  MISSING_FAMILY_CONTACT_MESSAGE,
  NO_FAMILY_CONTACT_MESSAGE,
  buildCompanionChatPayload,
  companionAlertPrecondition,
  companionHistoryForModel,
  companionSessionStorageKey,
  emergencyAlertClaimSql,
  emergencyAlertClaimToken,
  emergencyAlertGate,
  evaluateEmergencyAlertLimit,
  silenceAlertClaimSql,
  timestampTextViaJsDate,
  familyContactNameFromCare,
  filterCompanionChatHistory,
  resolveFamilyContactName,
} from "./companion-history";

const raymondThread = {
  role: "assistant" as const,
  content: "Raymond said he would call you this afternoon.",
  source: "workspace",
};

test("companion history keeps only this conversation and drops other chats and alerts", () => {
  const filtered = filterCompanionChatHistory([
    raymondThread,
    {
      role: "user",
      content: "How is the quote going?",
      source: undefined,
    },
    {
      role: "notification",
      content: "New lead from Raymond",
      source: "network",
      title: "Workspace",
    },
    {
      role: "assistant",
      content: "Hi Thandi — it's Cledwyn checking in. How are you feeling right now?",
      source: "companion",
      eventType: "check_in",
      title: "check_in",
    },
    {
      role: "assistant",
      content:
        "Hey there — I haven't heard from you for about 4 hours, so I'm letting Raymond know you're okay to check on.",
      source: "companion",
      title: "family_alert_patient",
    },
    {
      role: "assistant",
      content: "Cledwyn Companion: Someone hasn't replied for about 4 hours.",
      source: "companion",
      eventType: "family_alert_family",
    },
    {
      role: "user",
      content: "I feel a bit tired today",
      source: COMPANION_CHAT_SOURCE,
    },
    {
      role: "assistant",
      content: "I'm here with you. Would a cup of tea help?",
      source: COMPANION_CHAT_SOURCE,
    },
    {
      role: "user",
      content: "I feel a bit tired today",
      source: "companion",
      eventType: "patient_reply",
      title: "patient_reply",
    },
    {
      role: "system",
      content: "family alert dispatched",
    },
  ]);

  assert.deepEqual(
    filtered.map((turn) => turn.content),
    [
      "I feel a bit tired today",
      "I'm here with you. Would a cup of tea help?",
      "I feel a bit tired today",
    ],
  );
  assert.equal(JSON.stringify(filtered).includes("Raymond"), false);
  assert.ok(filtered.every((turn) => turn.source === COMPANION_CHAT_SOURCE));

  const again = filterCompanionChatHistory(filtered);
  assert.deepEqual(again, filtered);
  assert.equal(COMPANION_HISTORY_LIMIT, 12);

  const wire = companionHistoryForModel(filtered);
  assert.deepEqual(wire, [
    { role: "user", content: "I feel a bit tired today" },
    { role: "assistant", content: "I'm here with you. Would a cup of tea help?" },
    { role: "user", content: "I feel a bit tired today" },
  ]);
});

test("companion history drops only back-to-back duplicates", () => {
  const turns = filterCompanionChatHistory([
    { role: "user", content: "Hello", source: COMPANION_CHAT_SOURCE },
    { role: "user", content: "Hello", source: COMPANION_CHAT_SOURCE },
    { role: "assistant", content: "Hello to you too.", source: COMPANION_CHAT_SOURCE },
    { role: "user", content: "Hello", source: COMPANION_CHAT_SOURCE },
    { role: "user", content: "I need help", source: COMPANION_CHAT_SOURCE },
    { role: "user", content: "I need help", source: "companion", eventType: "patient_reply" },
  ]);
  assert.deepEqual(
    turns.map((turn) => `${turn.role}:${turn.content}`),
    ["user:Hello", "assistant:Hello to you too.", "user:Hello", "user:I need help"],
  );
});

test("companion mode uses its own session key", () => {
  const workspace = "lekker_cledwyn_session:user-1";
  const companion = companionSessionStorageKey(workspace);
  assert.notEqual(companion, workspace);
  assert.match(companion, /:companion$/);
});

test("untagged history is dropped so other Cledwyn chats cannot reach companion mode", () => {
  const filtered = filterCompanionChatHistory([
    { role: "user", content: "Tell Raymond I said hello" },
    { role: "assistant", content: "I'll mention Raymond." },
  ]);
  assert.deepEqual(filtered, []);
});

test("family contact name comes only from the saved contact record", () => {
  assert.equal(
    familyContactNameFromCare(
      { familyContactUserId: "contact-1" },
      { firstName: "Thandi", lastName: "Nkosi", username: "thandi" },
    ),
    "Thandi Nkosi",
  );
  assert.equal(
    resolveFamilyContactName({ firstName: "  ", lastName: "", username: "aya" }),
    "aya",
  );
  assert.equal(
    resolveFamilyContactName({
      firstName: "",
      lastName: "",
      username: "",
      businessName: "Raymond Logistics",
    } as { firstName: string; lastName: string; username: string }),
    null,
  );
  assert.equal(
    familyContactNameFromCare({ familyContactUserId: null }, { firstName: "Raymond", lastName: "Peters" }),
    null,
  );
  assert.equal(
    familyContactNameFromCare({ familyContactUserId: "missing" }, null),
    null,
  );
  assert.equal(
    familyContactNameFromCare(
      { familyContactUserId: "self" },
      { firstName: "Raymond" },
      { patientUserId: "self" },
    ),
    null,
  );
});

test("companion payload always sends familyContactName and never a name from history", () => {
  const history = companionHistoryForModel(
    filterCompanionChatHistory([
      raymondThread,
      { role: "user", content: "Hello Cledwyn", source: COMPANION_CHAT_SOURCE },
    ]),
  );
  const named = buildCompanionChatPayload({
    message: "Hello Cledwyn",
    userId: "net-1",
    displayName: "Amina",
    history,
    profile: "dementia",
    familyContactName: familyContactNameFromCare(
      { familyContactUserId: "contact-1" },
      { firstName: "Thandi", lastName: "Nkosi" },
    ),
    stream: true,
  });
  assert.equal(named.familyContactName, "Thandi Nkosi");
  assert.equal(named.mode, "companion");
  assert.equal(named.stream, true);
  assert.equal(JSON.stringify(named).includes("Raymond"), false);

  const none = buildCompanionChatPayload({
    message: "Hello",
    familyContactName: familyContactNameFromCare({ familyContactUserId: null }, null),
  });
  assert.equal(none.familyContactName, null);
  assert.equal("familyContactName" in none, true);
  assert.equal(none.stream, undefined);
});

test("emergency alert route requires companion mode, then a saved contact", () => {
  const companionOff = emergencyAlertGate(
    companionAlertPrecondition({
      companionEnabled: false,
      familyContactUserId: "contact-1",
      contactFound: true,
    }),
    { limited: false },
  );
  assert.equal(companionOff.proceed, false);
  if (!companionOff.proceed) {
    assert.equal(companionOff.status, 403);
    assert.equal(companionOff.body.alertSent, false);
    assert.equal(companionOff.body.message, COMPANION_REQUIRED_MESSAGE);
  }

  const noContact = emergencyAlertGate(
    companionAlertPrecondition({
      companionEnabled: true,
      familyContactUserId: null,
      contactFound: false,
    }),
    { limited: false },
  );
  assert.equal(noContact.proceed, false);
  if (!noContact.proceed) {
    assert.equal(noContact.status, 400);
    assert.equal(noContact.body.alertSent, false);
    assert.equal(noContact.body.success, false);
    assert.equal(noContact.body.message, NO_FAMILY_CONTACT_MESSAGE);
  }

  const missingUser = emergencyAlertGate(
    companionAlertPrecondition({
      companionEnabled: true,
      familyContactUserId: "gone",
      contactFound: false,
    }),
    { limited: false },
  );
  assert.equal(missingUser.proceed, false);
  if (!missingUser.proceed) {
    assert.equal(missingUser.status, 404);
    assert.equal(missingUser.body.message, MISSING_FAMILY_CONTACT_MESSAGE);
  }

  const ready = emergencyAlertGate(
    companionAlertPrecondition({
      companionEnabled: true,
      familyContactUserId: "contact-1",
      contactFound: true,
    }),
    { limited: false },
  );
  assert.deepEqual(ready, { proceed: true });
});

test("emergency alert limit is one per two minutes and five manual alerts per hour", () => {
  const start = Date.parse("2026-10-31T12:00:00.000Z");
  const gap = evaluateEmergencyAlertLimit({
    now: start + 60_000,
    lastFamilyAlertAt: start,
    manualAlertAt: [start],
  });
  assert.equal(gap.limited, true);
  if (gap.limited) {
    assert.equal(gap.status, 429);
    assert.equal(gap.message, EMERGENCY_ALERT_GAP_MESSAGE);
    assert.equal(gap.retryAfterSeconds, 60);
  }
  assert.equal(
    evaluateEmergencyAlertLimit({
      now: start + EMERGENCY_ALERT_MIN_GAP_MS,
      lastFamilyAlertAt: start,
      manualAlertAt: [start],
    }).limited,
    false,
  );

  const manualAlertAt = Array.from(
    { length: EMERGENCY_ALERT_HOURLY_CAP },
    (_, i) => start + i * EMERGENCY_ALERT_MIN_GAP_MS,
  );
  const blocked = evaluateEmergencyAlertLimit({
    now: start + EMERGENCY_ALERT_HOURLY_CAP * EMERGENCY_ALERT_MIN_GAP_MS,
    lastFamilyAlertAt: manualAlertAt[manualAlertAt.length - 1],
    manualAlertAt,
  });
  assert.equal(blocked.limited, true);
  if (blocked.limited) {
    assert.equal(blocked.status, 429);
    assert.equal(blocked.message, EMERGENCY_ALERT_HOURLY_MESSAGE);
  }

  const otherUser = evaluateEmergencyAlertLimit({
    now: start,
    lastFamilyAlertAt: null,
    manualAlertAt: [],
  });
  assert.equal(otherUser.limited, false);

  const http = emergencyAlertGate(
    companionAlertPrecondition({
      companionEnabled: true,
      familyContactUserId: "contact-1",
      contactFound: true,
    }),
    blocked,
  );
  assert.equal(http.proceed, false);
  if (!http.proceed) {
    assert.equal(http.status, 429);
    assert.equal(http.body.alertSent, false);
    assert.equal(http.body.message, EMERGENCY_ALERT_HOURLY_MESSAGE);
    assert.equal(typeof http.retryAfterSeconds, "number");
  }

  const claimSql = emergencyAlertClaimSql();
  assert.match(claimSql, /last_family_alert_sent_at = now\(\)/);
  assert.match(claimSql, /interval '2 minutes'/);
  assert.match(claimSql, /interval '1 hour'/);
  assert.match(claimSql, /family_alert_family/);
  assert.match(claimSql, /about_user_id = s\.user_id/);
  assert.match(claimSql, /metadata->>'manual'/);
  assert.match(claimSql, /RETURNING s\.last_family_alert_sent_at::text AS claimed_at/);
  assert.match(claimSql, /< 5/);
  assert.match(EMERGENCY_ALERT_RELEASE_SQL, /\$2::timestamp/);
  assert.match(EMERGENCY_ALERT_RELEASE_SQL, /\$3::timestamp/);

  const silenceSql = silenceAlertClaimSql();
  assert.match(silenceSql, /last_family_alert_sent_at = now\(\)/);
  assert.match(silenceSql, /\$2::int \* interval '1 millisecond'/);
  assert.match(silenceSql, /last_patient_reply_at/);
  assert.match(silenceSql, /RETURNING s\.last_family_alert_sent_at::text AS claimed_at/);
  assert.doesNotMatch(silenceSql, /family_alert_patient/);
});

test("claim timestamp text round-trips and a JS Date does not", () => {
  const stored = "2026-10-31 12:00:00.123456";
  const token = emergencyAlertClaimToken(stored);
  assert.equal(token, stored);
  assert.equal(emergencyAlertClaimToken(new Date(stored)), null);

  const viaDate = timestampTextViaJsDate(stored);
  assert.equal(viaDate, "2026-10-31 12:00:00.123000");
  assert.notEqual(viaDate, stored);
  assert.equal(token, stored);

  const withoutFraction = "2026-10-31 12:00:00";
  assert.equal(emergencyAlertClaimToken(withoutFraction), withoutFraction);
  assert.equal(timestampTextViaJsDate(withoutFraction), "2026-10-31 12:00:00.000000");
});
