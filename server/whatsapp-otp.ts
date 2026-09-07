import Twilio from "twilio";
import { normaliseMobile } from "../shared/mobile-utils";

function getConfig() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  // Prefer WhatsApp-specific sender; fall back to legacy TWILIO_PHONE_NUMBER used on Cloud Run.
  const from =
    process.env.TWILIO_WHATSAPP_FROM ??
    process.env.TWILIO_BUSINESS_FROM ??
    process.env.TWILIO_PHONE_NUMBER;
  const isApiKey = accountSid?.startsWith("SK");
  const mainAccountSid = isApiKey ? process.env.TWILIO_MAIN_ACCOUNT_SID : undefined;
  return { accountSid, authToken, from, isApiKey, mainAccountSid };
}

export function isWhatsAppOtpConfigured(): boolean {
  const { accountSid, authToken, from, isApiKey, mainAccountSid } = getConfig();
  if (!accountSid || !authToken || !from) return false;
  // Account SID must be AC… (or SK… API key + TWILIO_MAIN_ACCOUNT_SID).
  if (!accountSid.startsWith("AC") && !accountSid.startsWith("SK")) return false;
  if (isApiKey && !mainAccountSid) return false;
  return true;
}

export function whatsAppOtpConfigStatus(): {
  configured: boolean;
  hasAccountSid: boolean;
  accountSidLooksValid: boolean;
  hasAuthToken: boolean;
  hasFrom: boolean;
  hasContentSid: boolean;
} {
  const { accountSid, authToken, from } = getConfig();
  return {
    configured: isWhatsAppOtpConfigured(),
    hasAccountSid: !!accountSid,
    accountSidLooksValid: !!accountSid && (accountSid.startsWith("AC") || accountSid.startsWith("SK")),
    hasAuthToken: !!authToken,
    hasFrom: !!from,
    hasContentSid: !!process.env.TWILIO_CONTENT_SID,
  };
}

/** Send 6-digit OTP via WhatsApp (lekker.network platform lane). */
export async function sendWhatsAppOtp(to: string, code: string): Promise<void> {
  const e164 = normaliseMobile(to) ?? to;
  const { accountSid, authToken, from, isApiKey, mainAccountSid } = getConfig();

  if (!accountSid || !authToken || !from) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[whatsapp-otp] DEV — code for ${e164}: ${code}`);
      return;
    }
    throw new Error("WHATSAPP_OTP_NOT_CONFIGURED");
  }

  if (!accountSid.startsWith("AC") && !accountSid.startsWith("SK")) {
    throw new Error(
      "TWILIO_ACCOUNT_SID_INVALID: expected Account SID starting with AC… (or API Key SK… + TWILIO_MAIN_ACCOUNT_SID). Current value is not a Twilio account credential.",
    );
  }

  if (isApiKey && !mainAccountSid) {
    throw new Error(
      "TWILIO_ACCOUNT_SID is an API Key (SK…) but TWILIO_MAIN_ACCOUNT_SID (AC…) is not set.",
    );
  }

  const client =
    isApiKey && mainAccountSid
      ? Twilio(accountSid, authToken, { accountSid: mainAccountSid })
      : Twilio(accountSid, authToken);

  const contentSid = process.env.TWILIO_CONTENT_SID;
  const toWa = e164.startsWith("whatsapp:") ? e164 : `whatsapp:${e164}`;

  const senderParams = from.startsWith("MG")
    ? { messagingServiceSid: from }
    : { from: from.startsWith("whatsapp:") ? from : `whatsapp:${from}` };

  const plainTextBody = `Lekker Chat: Your verification code is ${code}. It expires in 10 minutes. Do not share this code.`;

  if (contentSid) {
    try {
      await client.messages.create({
        to: toWa,
        ...senderParams,
        contentSid,
        contentVariables: JSON.stringify({ 1: code }),
      });
      console.log(`[whatsapp-otp] Sent to ${e164} via Content Template`);
      return;
    } catch (templateErr: any) {
      const code21655 =
        templateErr?.code === 21655 || String(templateErr?.message || "").includes("21655");
      if (!code21655) throw templateErr;
      console.warn(
        `[whatsapp-otp] TWILIO_CONTENT_SID invalid (21655) — falling back to plain text`,
      );
    }
  }

  await client.messages.create({
    to: toWa,
    ...senderParams,
    body: plainTextBody,
  });
  console.log(`[whatsapp-otp] Sent to ${e164} via plain text`);
}
