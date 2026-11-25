/**
 * Transactional email for Lekker Chat (verification, password reset, report alerts).
 *
 * Provider order when SYSTEM_EMAIL_PROVIDER=auto (default):
 *   1. SMTP2GO HTTP API (https://api.smtp2go.com/v3/email/send) if a key is set
 *   2. inbound.new / Lekker Mail if INBOUND_API_KEY is set (fallback)
 *   3. Zeptomail if SYSTEM_ZEPTOMAIL_API_KEY is set
 *
 * Env:
 *   SMTP2GO_LEKKER_NETWORK_API_KEY — preferred (platform @lekker.network key)
 *   SMTP2GO_API_KEY                — used only if the lekker.network key is unset
 *   INBOUND_API_KEY                — inbound.new fallback
 *   SYSTEM_ZEPTOMAIL_API_KEY       — Zeptomail fallback
 * Optional:
 *   SYSTEM_FROM_EMAIL              — default noreply@lekker.network (verified SMTP2GO sender domain)
 *   SYSTEM_FROM_NAME               — default Lekker Chat
 *   SYSTEM_EMAIL_PROVIDER          — auto | smtp2go | inbound | zeptomail (default auto)
 *   SAFETY_REPORT_ALERT_TO         — comma-separated recipients; default warren@ and info@ digitalstudiohub.com
 */

const INBOUND_API_BASE = "https://inbound.new/api/e2";
const SMTP2GO_SEND_URL = "https://api.smtp2go.com/v3/email/send";

export type EmailProviderName = "smtp2go" | "inbound" | "zeptomail";

function inboundApiKey(): string {
  return (process.env.INBOUND_API_KEY || "").trim();
}

function zeptoApiKey(): string {
  return (process.env.SYSTEM_ZEPTOMAIL_API_KEY || "").trim();
}

/** Prefer the lekker.network system-mail key; never log the value. */
export function smtp2goApiKey(): string {
  return (
    (process.env.SMTP2GO_LEKKER_NETWORK_API_KEY || "").trim() ||
    (process.env.SMTP2GO_API_KEY || "").trim()
  );
}

function fromEmail(): string {
  return (process.env.SYSTEM_FROM_EMAIL || "noreply@lekker.network").trim();
}

function fromName(): string {
  return (process.env.SYSTEM_FROM_NAME || "Lekker Chat").trim();
}

function providerSetting(): string {
  return (process.env.SYSTEM_EMAIL_PROVIDER || "auto").trim().toLowerCase();
}

function normalizeRecipients(to: string | string[]): string[] {
  const values = (Array.isArray(to) ? to : [to])
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  const unique: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (!unique.some((existing) => existing.toLowerCase() === key)) unique.push(value);
  }
  return unique;
}

export function isSmtp2goConfigured(): boolean {
  return Boolean(smtp2goApiKey());
}

export function isTransactionalEmailConfigured(): boolean {
  return plannedEmailProviders().length > 0;
}

export function plannedEmailProviders(): EmailProviderName[] {
  const setting = providerSetting();
  const plan: EmailProviderName[] = [];
  const smtp = isSmtp2goConfigured();
  const inbound = Boolean(inboundApiKey());
  const zepto = Boolean(zeptoApiKey());

  if (setting === "zeptomail") {
    if (zepto) plan.push("zeptomail");
    return plan;
  }
  if (setting === "inbound") {
    if (inbound) plan.push("inbound");
    return plan;
  }
  // auto, smtp2go, or any other value: SMTP2GO first, inbound fallback, then zepto.
  if (smtp) plan.push("smtp2go");
  if (inbound) plan.push("inbound");
  if (setting !== "smtp2go" && zepto) plan.push("zeptomail");
  // Explicit smtp2go still falls back to inbound when configured (inbound.new is the documented fallback).
  return plan;
}

type ProviderSendResult = { recipient: string; ok: boolean; error?: string };

function logSendResults(provider: EmailProviderName, subject: string, results: ProviderSendResult[]): void {
  for (const result of results) {
    if (result.ok) {
      console.log(`[Email] ${provider} success to ${result.recipient}: ${subject}`);
    } else {
      console.error(`[Email] ${provider} failure to ${result.recipient}: ${result.error || "unknown error"}`);
    }
  }
}

async function sendViaSmtp2go(to: string[], subject: string, html: string, text: string): Promise<ProviderSendResult[]> {
  const key = smtp2goApiKey();
  if (!key) {
    return to.map((recipient) => ({ recipient, ok: false, error: "SMTP2GO API key is not set" }));
  }
  const senderName = fromName();
  const senderEmail = fromEmail();
  const response = await fetch(SMTP2GO_SEND_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Smtp2go-Api-Key": key,
    },
    body: JSON.stringify({
      sender: senderName ? `${senderName} <${senderEmail}>` : senderEmail,
      to,
      subject,
      html_body: html,
      text_body: text,
    }),
  });
  const payload: any = await response.json().catch(() => ({}));
  const data = payload?.data || {};
  const detail = data.error || data.error_code || (!response.ok ? `HTTP ${response.status}` : "");
  const failedCount = Number(data.failed || 0);
  const failures = Array.isArray(data.failures) ? data.failures : [];
  const failedAddresses = new Set(
    failures
      .map((item: any) => String(item?.email || item?.address || item?.recipient || "").trim().toLowerCase())
      .filter(Boolean),
  );
  if (!response.ok || data.error || data.error_code) {
    return to.map((recipient) => ({
      recipient,
      ok: false,
      error: String(detail || `SMTP2GO send failed (${response.status})`).slice(0, 500),
    }));
  }
  if (failedCount > 0 || failedAddresses.size > 0) {
    return to.map((recipient) => {
      const failed = failedAddresses.size ? failedAddresses.has(recipient.toLowerCase()) : true;
      return {
        recipient,
        ok: !failed,
        error: failed ? `SMTP2GO rejected recipient`.slice(0, 500) : undefined,
      };
    });
  }
  const emailId = String(data.email_id || "");
  const succeeded = Number(data.succeeded || 0);
  if (!emailId && succeeded < 1) {
    return to.map((recipient) => ({ recipient, ok: false, error: "SMTP2GO returned no email id" }));
  }
  return to.map((recipient) => ({ recipient, ok: true }));
}

async function sendViaInbound(to: string[], subject: string, html: string, text: string): Promise<ProviderSendResult[]> {
  const key = inboundApiKey();
  if (!key) {
    return to.map((recipient) => ({ recipient, ok: false, error: "INBOUND_API_KEY is not set" }));
  }
  const res = await fetch(`${INBOUND_API_BASE}/emails`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${fromName()} <${fromEmail()}>`,
      to,
      subject,
      html,
      text,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const error = `Lekker Mail send failed: ${res.status} ${body}`.slice(0, 500);
    return to.map((recipient) => ({ recipient, ok: false, error }));
  }
  return to.map((recipient) => ({ recipient, ok: true }));
}

async function sendViaZeptomail(to: string[], subject: string, html: string, text: string): Promise<ProviderSendResult[]> {
  const key = zeptoApiKey();
  if (!key) {
    return to.map((recipient) => ({ recipient, ok: false, error: "SYSTEM_ZEPTOMAIL_API_KEY is not set" }));
  }
  const results: ProviderSendResult[] = [];
  for (const recipient of to) {
    const res = await fetch("https://api.zeptomail.com/v1.1/email", {
      method: "POST",
      headers: {
        Authorization: key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: { address: fromEmail(), name: fromName() },
        to: [{ email_address: { address: recipient } }],
        subject,
        htmlbody: html,
        textbody: text,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      results.push({ recipient, ok: false, error: `Zeptomail send failed: ${res.status} ${body}`.slice(0, 500) });
    } else {
      results.push({ recipient, ok: true });
    }
  }
  return results;
}

export async function sendTransactionalEmail(
  to: string | string[],
  subject: string,
  html: string,
  text: string,
): Promise<boolean> {
  const recipients = normalizeRecipients(to);
  if (!recipients.length) {
    console.error("[Email] No recipients provided");
    return false;
  }

  const providers = plannedEmailProviders();
  if (!providers.length) {
    console.error("[Email] No SMTP2GO, INBOUND_API_KEY, or SYSTEM_ZEPTOMAIL_API_KEY configured");
    return false;
  }

  let pending = recipients;
  let anySuccess = false;
  for (const provider of providers) {
    if (!pending.length) break;
    try {
      const results =
        provider === "smtp2go"
          ? await sendViaSmtp2go(pending, subject, html, text)
          : provider === "inbound"
            ? await sendViaInbound(pending, subject, html, text)
            : await sendViaZeptomail(pending, subject, html, text);
      logSendResults(provider, subject, results);
      if (results.some((result) => result.ok)) anySuccess = true;
      pending = results.filter((result) => !result.ok).map((result) => result.recipient);
    } catch (err: any) {
      const error = String(err?.message || err).slice(0, 500);
      logSendResults(
        provider,
        subject,
        pending.map((recipient) => ({ recipient, ok: false, error })),
      );
    }
  }
  return pending.length === 0 && anySuccess;
}

function otpEmailHtml(opts: {
  firstName: string;
  code: string;
  heading: string;
  body: string;
  ignoreLine: string;
}): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#1A1A1A;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#1A1A1A;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#252525;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="background-color:#F5B800;padding:32px 24px;text-align:center;">
              <h1 style="margin:0;color:#1A1A1A;font-size:24px;font-weight:700;">Lekker Chat</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 24px;">
              <p style="margin:0 0 16px;color:#FFFFFF;font-size:16px;">Hi ${opts.firstName},</p>
              <p style="margin:0 0 24px;color:#B0B0B0;font-size:14px;line-height:22px;">
                ${opts.body}
              </p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:16px 0;">
                    <div style="background-color:#1A1A1A;border:2px solid #F5B800;border-radius:12px;padding:20px 32px;display:inline-block;">
                      <span style="font-size:36px;font-weight:700;color:#F5B800;letter-spacing:12px;font-family:monospace;">${opts.code}</span>
                    </div>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;color:#B0B0B0;font-size:13px;line-height:20px;">
                ${opts.ignoreLine}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px 24px;border-top:1px solid #333333;text-align:center;">
              <p style="margin:0;color:#666666;font-size:12px;">
                Powered by <a href="https://lekker.network" style="color:#F5B800;text-decoration:none;">Lekker Network</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendEmailVerificationEmail(toEmail: string, code: string, firstName: string): Promise<boolean> {
  const subject = `${code} is your Lekker Chat email verification code`;
  const text = `Hi ${firstName},\n\nYour Lekker Chat verification code is ${code}. It expires in 15 minutes.\n\nIf you didn't request this, ignore this email.`;
  const html = otpEmailHtml({
    firstName,
    code,
    heading: "Verify email",
    body: "Welcome to Lekker Chat! Use the code below to verify your email address. This code expires in 15 minutes.",
    ignoreLine: "If you didn't create a Lekker Chat account, you can safely ignore this email.",
  });
  try {
    return await sendTransactionalEmail(toEmail, subject, html, text);
  } catch (error) {
    console.error("[Email] Failed to send email verification:", error);
    return false;
  }
}

export async function sendPasswordResetEmail(toEmail: string, code: string, firstName: string): Promise<boolean> {
  const subject = `${code} is your Lekker Chat password reset code`;
  const text = `Hi ${firstName},\n\nYour Lekker Chat password reset code is ${code}. It expires in 15 minutes.\n\nIf you didn't request this, ignore this email.`;
  const html = otpEmailHtml({
    firstName,
    code,
    heading: "Reset password",
    body: "You requested to reset your password. Use the code below to continue. This code expires in 15 minutes.",
    ignoreLine: "If you didn't request this, you can safely ignore this email. Your password won't be changed.",
  });
  try {
    return await sendTransactionalEmail(toEmail, subject, html, text);
  } catch (error) {
    console.error("[Email] Failed to send password reset email:", error);
    return false;
  }
}


/**
 * Moderation alert for a new safety report. Never throws; returns false on any failure
 * so the caller's report flow is unaffected. Sends to every address in SAFETY_REPORT_ALERT_TO
 * (default warren@digitalstudiohub.com and info@digitalstudiohub.com).
 */
export async function sendSafetyReportAlertEmail(
  input: import("./safety-report-alert").SafetyReportAlertInput,
): Promise<boolean> {
  try {
    const { buildSafetyReportAlert } = await import("./safety-report-alert");
    const alert = buildSafetyReportAlert(input);
    const ok = await sendTransactionalEmail(alert.to, alert.subject, alert.html, alert.text);
    if (!ok) {
      console.error("[Email] Safety report alert was not fully delivered", { to: alert.to, subject: alert.subject });
    }
    return ok;
  } catch (error) {
    console.error("[Email] Failed to send safety report alert:", error);
    return false;
  }
}
