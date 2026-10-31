import { fetch } from "expo/fetch";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { getAuthToken } from "@/lib/auth-token";
import type { CledwynMessage } from "@/lib/storage";
import {
  COMPANION_CHAT_SOURCE,
  COMPANION_HISTORY_LIMIT,
  filterCompanionChatHistory,
  type CompanionHistoryMessage,
} from "@shared/companion-history";

export { COMPANION_CHAT_SOURCE };

export type CompanionServerMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  eventType: string;
  aboutUserId: string;
  metadata?: Record<string, unknown> | null;
  timestamp: string;
};

export async function fetchCompanionMessages(opts?: {
  limit?: number;
  since?: string;
}): Promise<CompanionServerMessage[]> {
  const q = new URLSearchParams();
  if (opts?.limit) q.set("limit", String(opts.limit));
  if (opts?.since) q.set("since", opts.since);
  const path = `/api/cledwyn/companion-messages${q.toString() ? `?${q}` : ""}`;
  const res = await apiRequest("GET", path);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.success) return [];
  return Array.isArray(data.messages) ? data.messages : [];
}

export async function markCompanionMessagesRead(): Promise<void> {
  try {
    await apiRequest("POST", "/api/cledwyn/companion-read", {});
    // Clear companion unread from app badge
    try {
      const { fetchChats, syncAppBadgeFromChats } = await import("@/lib/chat-api");
      const chats = await fetchChats();
      if (chats) await syncAppBadgeFromChats(chats);
    } catch {
      /* non-fatal */
    }
  } catch (e) {
    console.warn("[Companion] mark read failed", e);
  }
}

export const CLEDWYN_COMPANION_CHAT_ID = "__cledwyn_companion__";

export function isCompanionChat(chat: { id?: string; type?: string } | null | undefined): boolean {
  return chat?.id === CLEDWYN_COMPANION_CHAT_ID || chat?.type === "companion";
}

/** Merge server companion lines into local Cledwyn transcript (dedupe by id). */
export function mergeCompanionIntoCledwyn(
  local: CledwynMessage[],
  remote: CompanionServerMessage[],
): CledwynMessage[] {
  if (!remote.length) return local;
  const byId = new Map<string, CledwynMessage>();
  for (const m of local) byId.set(m.id, m);
  for (const r of remote) {
    byId.set(r.id, {
      id: r.id,
      role: r.role === "user" ? "user" : "assistant",
      content: r.content,
      timestamp: r.timestamp,
      source: "companion",
      eventType: r.eventType,
      title: r.eventType,
    });
  }
  return Array.from(byId.values()).sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
}

/**
 * History for companion-mode /api/cledwyn/chat.
 * Keeps this companion conversation only — not other Cledwyn threads,
 * check-ins, family alerts, or notification lines.
 */
export function companionModelHistory(
  messages: readonly (CompanionHistoryMessage | CledwynMessage)[],
): ReturnType<typeof filterCompanionChatHistory> {
  return filterCompanionChatHistory(messages).slice(-COMPANION_HISTORY_LIMIT);
}

export type EmergencyAlertResult = {
  alertSent: boolean;
  status: number;
  message: string;
  familyContactName: string | null;
};

/** POST /api/personal/emergency-alert. Success only when the server set alertSent. */
export async function sendEmergencyFamilyAlert(): Promise<EmergencyAlertResult> {
  const token = getAuthToken();
  const res = await fetch(`${getApiUrl()}api/personal/emergency-alert`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: "{}",
  });
  const data = await res.json().catch(() => ({}));
  const alertSent = res.ok && data?.success === true && data?.alertSent === true;
  const familyContactName =
    alertSent && typeof data?.familyContactName === "string" && data.familyContactName.trim()
      ? data.familyContactName.trim()
      : null;
  const message =
    typeof data?.message === "string" && data.message.trim()
      ? data.message.trim()
      : alertSent
        ? "Your family contact has been alerted."
        : "Couldn't send the family alert. Please try again.";
  return { alertSent, status: res.status, message, familyContactName };
}
