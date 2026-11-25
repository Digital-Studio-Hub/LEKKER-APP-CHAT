/**
 * Moderation alert for a new content report (App Store Guideline 1.2).
 * Pure builder so it can be unit-tested; sending lives in ./gmail.
 * Only ids, type and reason are included. Report details and message
 * content are not emailed.
 */

export const SAFETY_REPORT_ALERT_TO = "info@digitalstudiohub.com";

export type SafetyReportAlertInput = {
  reportId: string;
  reportType: string;
  reason: string;
  reporterId: string;
  reportedUserId?: string | null;
  messageId?: string | null;
  chatId?: string | null;
  createdAt?: Date;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function oneLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

export function buildSafetyReportAlert(input: SafetyReportAlertInput): {
  to: string;
  subject: string;
  text: string;
  html: string;
} {
  const created = (input.createdAt ?? new Date()).toISOString();
  const rows: [string, string][] = [
    ["Report id", input.reportId],
    ["Type", input.reportType],
    ["Reason", input.reason],
    ["Reporter user id", input.reporterId],
    ["Reported user id", input.reportedUserId || "-"],
    ["Message id", input.messageId || "-"],
    ["Chat id", input.chatId || "-"],
    ["Created (UTC)", created],
  ].map(([k, v]) => [k, oneLine(String(v))] as [string, string]);

  const subject = oneLine(
    `[Lekker Chat] New ${input.reportType} report (${input.reason}) - review within 24h`,
  ).slice(0, 200);

  const text = [
    "A Lekker Chat user submitted a safety report. Review it within 24 hours.",
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    "The report is stored in the content_reports table with status 'open'.",
  ].join("\n");

  const html = `<p>A Lekker Chat user submitted a safety report. Review it within 24 hours.</p>
<table cellpadding="4" cellspacing="0" border="1" style="border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;font-size:14px;">
${rows.map(([k, v]) => `<tr><th align="left">${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`).join("\n")}
</table>
<p>The report is stored in the <code>content_reports</code> table with status <code>open</code>.</p>`;

  return { to: SAFETY_REPORT_ALERT_TO, subject, text, html };
}
