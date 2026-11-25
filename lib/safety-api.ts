import { ActionSheetIOS, Alert, Platform } from "react-native";
import { apiRequest } from "@/lib/query-client";
import { ABUSE_CONTACT_EMAIL, REPORT_REASONS } from "@/constants/safety";

export type SafetyReportType = "user" | "message" | "chat" | "post" | "comment";

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
  reportType: SafetyReportType;
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
  reportType: SafetyReportType;
  reportedUserId?: string;
  messageId?: string;
  chatId?: string;
  subjectLabel?: string;
  details?: string;
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
        details: opts.details,
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

/** Report / block menu for a newsfeed post or comment (Guideline 1.2). */
export function promptReportOrBlock(opts: {
  title: string;
  reportLabel: string;
  blockLabel: string;
  onReport: () => void;
  onBlock: () => void;
}) {
  if (Platform.OS === "ios") {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: opts.title,
        options: [opts.reportLabel, opts.blockLabel, "Cancel"],
        cancelButtonIndex: 2,
        destructiveButtonIndex: 1,
      },
      (idx) => {
        if (idx === 0) opts.onReport();
        if (idx === 1) opts.onBlock();
      },
    );
    return;
  }

  Alert.alert(opts.title, undefined, [
    { text: opts.reportLabel, onPress: opts.onReport },
    { text: opts.blockLabel, style: "destructive", onPress: opts.onBlock },
    { text: "Cancel", style: "cancel" },
  ]);
}

export function confirmBlockUser(name: string, onConfirm: () => void | Promise<void>) {
  Alert.alert(
    `Block ${name}?`,
    "Their posts and comments will be hidden, and they can't message you. You can unblock them later from Settings.",
    [
      { text: "Cancel", style: "cancel" },
      { text: "Block", style: "destructive", onPress: () => { void onConfirm(); } },
    ],
  );
}