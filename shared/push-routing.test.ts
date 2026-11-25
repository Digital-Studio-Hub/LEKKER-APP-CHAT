import assert from "node:assert/strict";
import test from "node:test";
import {
  deliveryChannel,
  normalisePushProvider,
  planPushDeliveries,
  pushAcquisitionPlan,
} from "./push-routing.ts";

test("android without GMS uses HMS only", () => {
  assert.deepEqual(pushAcquisitionPlan("android", "unavailable"), ["hms"]);
});

test("android with GMS keeps FCM and does not ask for an HMS token", () => {
  assert.deepEqual(pushAcquisitionPlan("android", "available"), ["fcm"]);
});

test("unknown GMS tries FCM first, then HMS", () => {
  assert.deepEqual(pushAcquisitionPlan("android", "unknown"), ["fcm", "hms"]);
});

test("ios stays on the Expo/APNs path and web registers nothing", () => {
  assert.deepEqual(pushAcquisitionPlan("ios", "unavailable"), ["apns"]);
  assert.deepEqual(pushAcquisitionPlan("web", "unavailable"), []);
});

test("provider names normalise and unknown values stay on Expo", () => {
  assert.equal(normalisePushProvider("HMS"), "hms");
  assert.equal(normalisePushProvider(" fcm "), "fcm");
  assert.equal(normalisePushProvider("apns"), "apns");
  assert.equal(normalisePushProvider(null), "expo");
  assert.equal(normalisePushProvider("play"), "expo");
  assert.equal(deliveryChannel("hms"), "hms");
  assert.equal(deliveryChannel("fcm"), "expo");
  assert.equal(deliveryChannel("apns"), "expo");
  assert.equal(deliveryChannel(undefined), "expo");
});

test("delivery plan sends only HMS tokens to Huawei", () => {
  const plan = planPushDeliveries([
    { token: "hms-device-1", provider: "hms" },
    { token: "ExponentPushToken[abc]", provider: "fcm" },
    { token: "ExponentPushToken[ios]", provider: "apns" },
    { token: "ExponentPushToken[legacy]", provider: null },
    { token: "ExponentPushToken[typo]", provider: "gcm" },
    { token: "", provider: "hms" },
  ]);

  assert.deepEqual(plan.hms.map((t) => t.token), ["hms-device-1"]);
  assert.deepEqual(plan.expo.map((t) => t.token), [
    "ExponentPushToken[abc]",
    "ExponentPushToken[ios]",
    "ExponentPushToken[legacy]",
    "ExponentPushToken[typo]",
  ]);
});
