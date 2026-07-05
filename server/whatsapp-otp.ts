import Twilio from "twilio";
import { normaliseMobile } from "../shared/mobile-utils";

function getConfig() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM ?? process.env.TWILIO_BUSINESS_FROM;
  const isApiKey = accountSid?.startsWith("SK");
  const mainAccountSid = isApiKey ? process.env.TWILIO_MAIN_ACCOUNT_SID : undefined;
  return { accountSid, authToken, from, isApiKey, mainAccountSid };
}

export function isWhatsAppOtpConfigured(): boolean {
  const { accountSid, authToken, from, isApiKey, mainAccountSid } = getConfig();
  if (!accountSid || !authToken || !from) return false;
  if (isApiKey && !mainAccountSid) return false;
  return true;
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

  const client =
    isApiKey && mainAccountSid
      ? Twilio(accountSid, authToken, { accountSid: mainAccountSid })
      : Twilio(accountSid, authToken);

  const contentSid = process.env.TWILIO_CONTENT_SID;
  const toWa = e164.startsWith("whatsapp:") ? e164 : `whatsapp:${e164}`;
  const fromWa = from.startsWith("whatsapp:") ? from : `whatsapp:${from}`;

  if (contentSid) {
    await client.messages.create({
      from: fromWa,
      to: toWa,
      contentSid,
      contentVariables: JSON.stringify({ 1: code }),
    });
  } else {
    await client.messages.create({
      from: fromWa,
      to: toWa,
      body: `Lekker Chat: Your verification code is ${code}. It expires in 10 minutes. Do not share this code.`,
    });
  }

  console.log(`[whatsapp-otp] Sent to ${e164}`);
}