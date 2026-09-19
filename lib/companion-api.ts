import { apiRequest } from "@/lib/query-client";
import type { CledwynMessage } from "@/lib/storage";

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
      title: r.eventType,
    });
  }
  return Array.from(byId.values()).sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
}
