import Twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;

export async function sendPhoneVerificationSMS(toPhone: string, code: string): Promise<boolean> {
  if (!accountSid || !authToken || !fromNumber) {
    console.error("[Twilio] Missing Twilio credentials");
    return false;
  }

  try {
    const client = Twilio(accountSid, authToken);
    await client.messages.create({
      body: `Lekker Chat: Your verification code is ${code}. It expires in 10 minutes. Do not share this code with anyone.`,
      from: fromNumber,
      to: toPhone,
    });
    console.log(`[Twilio] Phone verification SMS sent to ${toPhone}`);
    return true;
  } catch (error) {
    console.error("[Twilio] Failed to send phone verification SMS:", error);
    return false;
  }
}

export async function sendPasswordResetSMS(toPhone: string, code: string, firstName: string): Promise<boolean> {
  if (!accountSid || !authToken || !fromNumber) {
    console.error("[Twilio] Missing Twilio credentials");
    return false;
  }

  try {
    const client = Twilio(accountSid, authToken);

    await client.messages.create({
      body: `Lekker Chat: Hi ${firstName}, your password reset code is ${code}. It expires in 15 minutes. If you didn't request this, ignore this message.`,
      from: fromNumber,
      to: toPhone,
    });

    console.log(`[Twilio] Password reset SMS sent to ${toPhone}`);
    return true;
  } catch (error) {
    console.error("[Twilio] Failed to send password reset SMS:", error);
    return false;
  }
}
