/**
 * WhatsApp deep-link invites for contacts not yet on Lekker Chat.
 * Opens the WhatsApp app with a prefilled message (no Twilio send).
 */
import { Linking, Platform, Share } from "react-native";

export const LEKKER_CHAT_DOWNLOAD_URL = "https://chat.lekker.network";
export const LEKKER_CHAT_PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.lekker.chat";

export function buildInviteMessage(opts: {
  contactFirstName?: string;
  inviterName?: string;
}): string {
  const who = (opts.contactFirstName || "").trim() || "there";
  const from = (opts.inviterName || "").trim();
  const fromBit = from ? ` — I'm ${from}` : "";
  return (
    `Hey ${who}! Join me on Lekker Chat${fromBit}. ` +
    `It's the messaging app for South African entrepreneurs and customers. ` +
    `Get it here: ${LEKKER_CHAT_DOWNLOAD_URL}`
  );
}

/** Digits-only E.164 without + for wa.me */
export function phoneForWaMe(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function whatsAppInviteUrl(phone: string, message: string): string {
  const cleaned = phoneForWaMe(phone);
  return `https://wa.me/${cleaned}?text=${encodeURIComponent(message)}`;
}

export async function openWhatsAppInvite(phone: string, message: string): Promise<boolean> {
  const url = whatsAppInviteUrl(phone, message);
  try {
    const can = await Linking.canOpenURL(url);
    if (can || Platform.OS !== "web") {
      await Linking.openURL(url);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    await Share.share({ message });
    return true;
  } catch {
    return false;
  }
}

/**
 * Open WhatsApp invites one-by-one with a short delay so the OS can hand off.
 * Caps at `max` to avoid flooding; caller should warn when truncated.
 */
export async function openWhatsAppInvitesSequential(
  contacts: Array<{ phone: string; name: string }>,
  opts: { inviterName?: string; max?: number; delayMs?: number } = {},
): Promise<{ opened: number; skipped: number }> {
  const max = opts.max ?? 25;
  const delayMs = opts.delayMs ?? 900;
  const slice = contacts.slice(0, max);
  let opened = 0;
  for (const c of slice) {
    const first = (c.name || "").split(/\s+/)[0] || "there";
    const msg = buildInviteMessage({
      contactFirstName: first,
      inviterName: opts.inviterName,
    });
    const ok = await openWhatsAppInvite(c.phone, msg);
    if (ok) opened += 1;
    if (slice.indexOf(c) < slice.length - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return { opened, skipped: Math.max(0, contacts.length - slice.length) };
}
