import assert from "node:assert/strict";
import test from "node:test";
import { buildSafetyReportAlert, SAFETY_REPORT_ALERT_TO } from "./safety-report-alert";

test("alert goes to the moderation inbox with ids, type and reason", () => {
  const alert = buildSafetyReportAlert({
    reportId: "rep-1",
    reportType: "message",
    reason: "harassment",
    reporterId: "user-a",
    reportedUserId: "user-b",
    messageId: "msg-9",
    chatId: "chat-3",
    createdAt: new Date("2026-11-25T08:00:00.000Z"),
  });
  assert.equal(alert.to, SAFETY_REPORT_ALERT_TO);
  assert.equal(alert.to, "info@digitalstudiohub.com");
  assert.match(alert.subject, /message report \(harassment\)/);
  for (const value of ["rep-1", "message", "harassment", "user-a", "user-b", "msg-9", "chat-3", "2026-11-25T08:00:00.000Z"]) {
    assert.ok(alert.text.includes(value), `text missing ${value}`);
    assert.ok(alert.html.includes(value), `html missing ${value}`);
  }
});

test("missing target ids are shown as dashes", () => {
  const alert = buildSafetyReportAlert({ reportId: "r", reportType: "user", reason: "spam", reporterId: "u" });
  assert.match(alert.text, /Reported user id: -/);
  assert.match(alert.text, /Message id: -/);
  assert.match(alert.text, /Chat id: -/);
});

test("user-controlled reason is escaped in html and kept on one line", () => {
  const alert = buildSafetyReportAlert({
    reportId: "r",
    reportType: "user",
    reason: "<b>x</b>\nInjected: header",
    reporterId: "u",
  });
  assert.equal(alert.html.includes("<b>x</b>"), false);
  assert.ok(alert.html.includes("&lt;b&gt;x&lt;/b&gt;"));
  assert.equal(alert.subject.includes("\n"), false);
});
