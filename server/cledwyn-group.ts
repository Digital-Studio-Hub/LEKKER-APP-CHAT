/**
 * Workspace-bound "{Name}'s Cledwyn" in Lekker Chat groups.
 * One bot user per lekkerpreneur workspace; replies on @mention or reply-to.
 */
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { storage, db } from "./storage";
import { chatMessages, type User, type ChatMessage } from "@shared/schema";
import { chatWithNetworkCledwyn, isLekkerNetworkConfigured } from "./lekkerNetwork";
import { notifyChatMessage } from "./push";

export const CLEDWYN_BOT_USERNAME_PREFIX = "cledwyn_ws_";

export function isCledwynBotUser(user: Pick<User, "username" | "role"> | null | undefined): boolean {
  if (!user?.username) return false;
  return user.username.startsWith(CLEDWYN_BOT_USERNAME_PREFIX);
}

function botUsernameForWorkspace(workspaceId: string): string {
  const compact = workspaceId.replace(/-/g, "").slice(0, 16).toLowerCase();
  return `${CLEDWYN_BOT_USERNAME_PREFIX}${compact}`;
}

function botPhoneForWorkspace(workspaceId: string): string {
  const h = createHash("sha256").update(`cledwyn-bot:${workspaceId}`).digest("hex");
  const n = BigInt(`0x${h.slice(0, 10)}`) % 1_000_000_000n;
  return `+279${n.toString().padStart(9, "0")}`;
}

function displayNameForOwner(owner: User): { firstName: string; lastName: string } {
  const base =
    (owner.firstName || "").trim() ||
    (owner.businessName || "").trim().split(/\s+/)[0] ||
    (owner.username || "").trim() ||
    "Workspace";
  return { firstName: `${base}'s`, lastName: "Cledwyn" };
}

/** Create or refresh the workspace Cledwyn bot user for this lekkerpreneur. */
export async function ensureWorkspaceCledwynBot(owner: User): Promise<User | null> {
  if (!owner.isVerifiedLekkerpreneur || !owner.lekkerWorkspaceId || !owner.lekkerNetworkId) {
    return null;
  }
  const workspaceId = owner.lekkerWorkspaceId;
  const username = botUsernameForWorkspace(workspaceId);
  const existing = await storage.getUserByUsername(username);
  const names = displayNameForOwner(owner);

  if (existing) {
    if (existing.firstName !== names.firstName || existing.lastName !== names.lastName) {
      const updated = await storage.updateUser(existing.id, {
        firstName: names.firstName,
        lastName: names.lastName,
        lekkerWorkspaceId: workspaceId,
        lekkerNetworkId: owner.lekkerNetworkId,
        isVerifiedLekkerpreneur: true,
        avatarColor: "#F5B800",
      } as any);
      return updated || existing;
    }
    return existing;
  }

  const phone = botPhoneForWorkspace(workspaceId);
  // Avoid phone collision
  const phoneTaken = await storage.getUserByPhone(phone);
  if (phoneTaken) return phoneTaken;

  try {
    return await storage.createUser({
      phone,
      phoneVerified: true,
      emailVerified: false,
      username,
      firstName: names.firstName,
      lastName: names.lastName,
      lekkerWorkspaceId: workspaceId,
      lekkerNetworkId: owner.lekkerNetworkId,
      isVerifiedLekkerpreneur: true,
      avatarColor: "#F5B800",
      role: "bot",
      notificationsEnabled: false,
    } as any);
  } catch (e) {
    console.error("[cledwyn-group] create bot failed:", e);
    return storage.getUserByUsername(username);
  }
}

export async function addCledwynToGroup(chatId: string, owner: User): Promise<{ ok: boolean; bot?: User; message?: string }> {
  const chat = await storage.getChat(chatId);
  if (!chat || chat.type !== "group") {
    return { ok: false, message: "Not a group chat" };
  }
  const bot = await ensureWorkspaceCledwynBot(owner);
  if (!bot) {
    return {
      ok: false,
      message: "Sync a lekker.network workspace as a verified Lekkerpreneur to add your Cledwyn.",
    };
  }
  const inChat = await storage.isUserInChat(chatId, bot.id);
  if (!inChat) {
    await storage.addChatParticipant(chatId, bot.id, "member");
  }
  return { ok: true, bot };
}

function mentionsCledwyn(text: string, bot: User): boolean {
  const lower = text.toLowerCase();
  if (/(^|\s)@cledwyn\b/i.test(text)) return true;
  if (/(^|\s)@cledwyn_ws_/i.test(text)) return true;
  const full = `${bot.firstName} ${bot.lastName}`.trim().toLowerCase();
  if (full.length > 3 && lower.includes(`@${full}`)) return true;
  if (full.length > 3 && lower.includes(full)) {
    // Soft match only with @ somewhere or "cledwyn"
    if (lower.includes("@") || /\bcledwyn\b/i.test(text)) return true;
  }
  return /\bcledwyn\b/i.test(text) && /@(?:\w+)/.test(text);
}

async function isReplyToCledwyn(replyToMessageId: string | null | undefined, botId: string): Promise<boolean> {
  if (!replyToMessageId) return false;
  const [msg] = await db
    .select({ senderId: chatMessages.senderId })
    .from(chatMessages)
    .where(eq(chatMessages.id, replyToMessageId))
    .limit(1);
  return msg?.senderId === botId;
}

/**
 * If this group message @mentions Cledwyn or replies to it, generate a workspace
 * Cledwyn reply (Memory Palace via Network) and post it as the bot user.
 */
export async function maybeReplyAsGroupCledwyn(opts: {
  chatId: string;
  senderId: string;
  content: string | null;
  replyToMessageId?: string | null;
}): Promise<ChatMessage | null> {
  try {
    if (!opts.content?.trim()) return null;
    if (!isLekkerNetworkConfigured()) return null;

    const chat = await storage.getChat(opts.chatId);
    if (!chat || chat.type !== "group") return null;

    const participants = await storage.getChatParticipants(opts.chatId);
    const participantUsers = await Promise.all(participants.map((p) => storage.getUser(p.userId)));
    const bot = participantUsers.find((u) => u && isCledwynBotUser(u)) || null;
    if (!bot) return null;
    if (opts.senderId === bot.id) return null;

    const replyHit = await isReplyToCledwyn(opts.replyToMessageId, bot.id);
    const mentionHit = mentionsCledwyn(opts.content, bot);
    if (!replyHit && !mentionHit) return null;

    const workspaceId = bot.lekkerWorkspaceId;
    const networkUserId = bot.lekkerNetworkId;
    if (!workspaceId || !networkUserId) return null;

    const prompt =
      `You are ${bot.firstName} ${bot.lastName}, the workspace Cledwyn assistant in a Lekker Chat group. ` +
      `Reply helpfully and briefly (2–5 sentences). Use Memory Palace / workspace context when relevant. ` +
      `You are not a doctor. For heavy workspace edits, suggest Software → Cledwyn.\n\n` +
      `Group message from a member:\n${opts.content.trim()}`;

    const result = await chatWithNetworkCledwyn({
      userId: networkUserId,
      workspaceId,
      message: prompt,
    });

    const replyText = (result.reply || "").trim();
    if (!replyText) return null;

    const msg = await storage.sendMessage(opts.chatId, bot.id, replyText, "text", {
      replyToMessageId: undefined,
    });
    void notifyChatMessage(opts.chatId, bot.id, msg);
    return msg;
  } catch (e) {
    console.error("[cledwyn-group] reply failed:", e);
    return null;
  }
}
