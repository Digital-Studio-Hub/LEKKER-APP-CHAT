/**
 * Transactional email for Lekker Chat (verification + password reset).
 *
 * Ecosystem-aligned: uses Lekker Mail (inbound.new) and/or Zeptomail —
 * same providers as lekker.network system mail. The old Replit Gmail
 * connector path is intentionally removed (broken on Cloud Run).
 *
 * Env (any one of):
 *   INBOUND_API_KEY          — preferred (Lekker Mail / inbound.new)
 *   SYSTEM_ZEPTOMAIL_API_KEY — Zeptomail fallback / primary if inbound unset
 * Optional:
 *   SYSTEM_FROM_EMAIL        — default noreply@lekker.network
 *   SYSTEM_FROM_NAME         — default Lekker Chat
 *   SYSTEM_EMAIL_PROVIDER    — auto | inbound | zeptomail (default auto)
 */

const INBOUND_API_BASE = "https://inbound.new/api/e2";
const INBOUND_API_KEY = process.env.INBOUND_API_KEY || "";
const ZEPTOMAIL_API_KEY = process.env.SYSTEM_ZEPTOMAIL_API_KEY || "";
const FROM_EMAIL = process.env.SYSTEM_FROM_EMAIL || "noreply@lekker.network";
const FROM_NAME = process.env.SYSTEM_FROM_NAME || "Lekker Chat";
const PROVIDER = (process.env.SYSTEM_EMAIL_PROVIDER || "auto").toLowerCase();

export function isTransactionalEmailConfigured(): boolean {
  const inboundOk = PROVIDER !== "zeptomail" && Boolean(INBOUND_API_KEY);
  const zeptoOk = PROVIDER !== "inbound" && Boolean(ZEPTOMAIL_API_KEY);
  return inboundOk || zeptoOk;
}

async function sendViaInbound(to: string, subject: string, html: string, text: string): Promise<boolean> {
  if (!INBOUND_API_KEY) return false;
  const res = await fetch(`${INBOUND_API_BASE}/emails`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${INBOUND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: [to],
      subject,
      html,
      text,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Lekker Mail send failed: ${res.status} ${body}`);
  }
  return true;
}

async function sendViaZeptomail(to: string, subject: string, html: string, text: string): Promise<boolean> {
  if (!ZEPTOMAIL_API_KEY) return false;
  const res = await fetch("https://api.zeptomail.com/v1.1/email", {
    method: "POST",
    headers: {
      Authorization: ZEPTOMAIL_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: { address: FROM_EMAIL, name: FROM_NAME },
      to: [{ email_address: { address: to } }],
      subject,
      htmlbody: html,
      textbody: text,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Zeptomail send failed: ${res.status} ${body}`);
  }
  return true;
}

async function sendTransactionalEmail(to: string, subject: string, html: string, text: string): Promise<boolean> {
  if (!isTransactionalEmailConfigured()) {
    console.error("[Email] No INBOUND_API_KEY or SYSTEM_ZEPTOMAIL_API_KEY configured");
    return false;
  }

  const tryInbound = PROVIDER !== "zeptomail" && Boolean(INBOUND_API_KEY);
  const tryZepto = PROVIDER !== "inbound" && Boolean(ZEPTOMAIL_API_KEY);

  if (tryInbound) {
    try {
      await sendViaInbound(to, subject, html, text);
      console.log(`[Email] Sent via Lekker Mail to ${to}: ${subject}`);
      return true;
    } catch (err: any) {
      console.warn("[Email] Lekker Mail failed:", err?.message || err);
      if (!tryZepto) return false;
    }
  }

  if (tryZepto) {
    try {
      await sendViaZeptomail(to, subject, html, text);
      console.log(`[Email] Sent via Zeptomail to ${to}: ${subject}`);
      return true;
    } catch (err: any) {
      console.error("[Email] Zeptomail failed:", err?.message || err);
      return false;
    }
  }

  return false;
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
