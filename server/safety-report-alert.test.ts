import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSafetyReportAlert,
  parseSafetyReportAlertRecipients,
  SAFETY_REPORT_ALERT_DEFAULT_RECIPIENTS,
  SAFETY_REPORT_ALERT_TO_ENV,
} from "./safety-report-alert";

test("alert defaults to warren@ and info@ with ids, type and reason", () => {
  const previous = process.env[SAFETY_REPORT_ALERT_TO_ENV];
  delete process.env[SAFETY_REPORT_ALERT_TO_ENV];
  try {
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
    assert.deepEqual(alert.to, ["warren@digitalstudiohub.com", "info@digitalstudiohub.com"]);
    assert.deepEqual(alert.to, [...SAFETY_REPORT_ALERT_DEFAULT_RECIPIENTS]);
    assert.match(alert.subject, /message report \(harassment\)/);
    for (const value of ["rep-1", "message", "harassment", "user-a", "user-b", "msg-9", "chat-3", "2026-11-25T08:00:00.000Z"]) {
      assert.ok(alert.text.includes(value), `text missing ${value}`);
      assert.ok(alert.html.includes(value), `html missing ${value}`);
    }
  } finally {
    if (previous === undefined) delete process.env[SAFETY_REPORT_ALERT_TO_ENV];
    else process.env[SAFETY_REPORT_ALERT_TO_ENV] = previous;
  }
});

test("SAFETY_REPORT_ALERT_TO overrides the default recipient list", () => {
  assert.deepEqual(
    parseSafetyReportAlertRecipients("  warren@digitalstudiohub.com, info@digitalstudiohub.com "),
    ["warren@digitalstudiohub.com", "info@digitalstudiohub.com"],
  );
  assert.deepEqual(
    parseSafetyReportAlertRecipients("mods@example.com; ALSO@example.com,mods@example.com"),
    ["mods@example.com", "also@example.com"],
  );
  assert.deepEqual(
    parseSafetyReportAlertRecipients(""),
    ["warren@digitalstudiohub.com", "info@digitalstudiohub.com"],
  );
  assert.deepEqual(
    parseSafetyReportAlertRecipients("not-an-email, also bad"),
    ["warren@digitalstudiohub.com", "info@digitalstudiohub.com"],
  );
});

test("missing target ids are shown as dashes", () => {
  const previous = process.env[SAFETY_REPORT_ALERT_TO_ENV];
  delete process.env[SAFETY_REPORT_ALERT_TO_ENV];
  try {
    const alert = buildSafetyReportAlert({ reportId: "r", reportType: "user", reason: "spam", reporterId: "u" });
    assert.match(alert.text, /Reported user id: -/);
    assert.match(alert.text, /Message id: -/);
    assert.match(alert.text, /Chat id: -/);
  } finally {
    if (previous === undefined) delete process.env[SAFETY_REPORT_ALERT_TO_ENV];
    else process.env[SAFETY_REPORT_ALERT_TO_ENV] = previous;
  }
});

test("user-controlled reason is escaped in html and kept on one line", () => {
  const previous = process.env[SAFETY_REPORT_ALERT_TO_ENV];
  delete process.env[SAFETY_REPORT_ALERT_TO_ENV];
  try {
    const alert = buildSafetyReportAlert({
      reportId: "r",
      reportType: "user",
      reason: "<b>x</b>\nInjected: header",
      reporterId: "u",
    });
    assert.equal(alert.html.includes("<b>x</b>"), false);
    assert.ok(alert.html.includes("&lt;b&gt;x&lt;/b&gt;"));
    assert.equal(alert.subject.includes("\n"), false);
  } finally {
    if (previous === undefined) delete process.env[SAFETY_REPORT_ALERT_TO_ENV];
    else process.env[SAFETY_REPORT_ALERT_TO_ENV] = previous;
  }
});
