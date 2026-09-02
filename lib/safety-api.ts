import { Alert } from "react-native";
import { apiRequest } from "@/lib/query-client";
import { ABUSE_CONTACT_EMAIL, REPORT_REASONS } from "@/constants/safety";

export type BlockedUserRow = {
  id: string;
  blockedUserId: string;
  name: string;
  createdAt: string;
};

export async function fetchBlockedUsers(): Promise<BlockedUserRow[]> {
  try {
    const res = await apiRequest("GET", "/api/safety/blocks");
    const data = await res.json();
    return data.blocks || [];
  } catch {
    return [];
  }
}

export async function blockUserServer(userId: string): Promise<boolean> {
  try {
    await apiRequest("POST", "/api/safety/block", { userId });
    return true;
  } catch {
    return false;
  }
}

export async function unblockUserServer(userId: string): Promise<boolean> {
  try {
    await apiRequest("DELETE", `/api/safety/block/${userId}`);
    return true;
  } catch {
    return false;
  }
}

export async function isUserBlockedServer(userId: string): Promise<boolean> {
  const blocks = await fetchBlockedUsers();
  return blocks.some((b) => b.blockedUserId === userId);
}

export async function submitContentReport(input: {
  reportType: "user" | "message" | "chat";
  reason: string;
  reportedUserId?: string;
  messageId?: string;
  chatId?: string;
  details?: string;
}): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await apiRequest("POST", "/api/safety/report", input);
    const data = await res.json();
    return { ok: true, message: data.message };
  } catch (e: any) {
    return { ok: false, message: e?.message || "Could not submit report" };
  }
}

/** Present report reason picker (Guideline 1.2 — flag objectionable content). */
export function promptContentReport(opts: {
  reportType: "user" | "message" | "chat";
  reportedUserId?: string;
  messageId?: string;
  chatId?: string;
  subjectLabel?: string;
}) {
  const title = opts.subjectLabel ? `Report ${opts.subjectLabel}` : "Report content";
  const buttons = REPORT_REASONS.map((r) => ({
    text: r.label,
    onPress: async () => {
      const result = await submitContentReport({
        reportType: opts.reportType,
        reason: r.id,
        reportedUserId: opts.reportedUserId,
        messageId: opts.messageId,
        chatId: opts.chatId,
      });
      Alert.alert(
        result.ok ? "Report submitted" : "Report failed",
        result.ok
          ? `${result.message}\n\nYou can also email ${ABUSE_CONTACT_EMAIL} for urgent safety concerns.`
          : result.message,
      );
    },
  }));
  Alert.alert(
    title,
    "Reports are reviewed within 24 hours. Offending content may be removed and accounts suspended.",
    [...buttons, { text: "Cancel", style: "cancel" }],
  );
}