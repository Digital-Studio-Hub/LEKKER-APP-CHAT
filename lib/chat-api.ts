import { Platform } from "react-native";
import * as FileSystem from "expo-file-system";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { getAuthToken } from "@/lib/auth-token";

export interface ChatParticipant {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  avatarColor: string | null;
  profilePhoto: string | null;
  isVerifiedLekkerpreneur: boolean | null;
  businessName: string | null;
  presence: string | null;
  role?: string | null;
  isCledwyn?: boolean;
}

export interface ServerMessage {
  id: string;
  chatId: string;
  senderId: string;
  content: string | null;
  type: string;
  status: string;
  imageUri: string | null;
  fileUri: string | null;
  fileName: string | null;
  fileSize: number | null;
  audioUri: string | null;
  audioDuration: number | null;
  waveformData: string | null;
  latitude: string | null;
  longitude: string | null;
  locationName: string | null;
  pollQuestion: string | null;
  pollOptions: string | null;
  sharedContactName: string | null;
  sharedContactPhone: string | null;
  replyToMessageId?: string | null;
  editedAt: string | null;
  isDeleted: boolean;
  createdAt: string;
}

export interface ServerChat {
  id: string;
  type: string;
  name: string | null;
  createdAt: string;
  updatedAt: string;
  participants: ChatParticipant[];
  lastMessage: {
    id: string;
    senderId: string;
    content: string | null;
    type: string;
    status: string;
    createdAt: string;
  } | null;
  unreadCount: number;
}

export interface SearchUser {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  avatarColor: string | null;
  profilePhoto: string | null;
  isVerifiedLekkerpreneur: boolean | null;
  businessName: string | null;
  presence: string | null;
}

export async function fetchChats(): Promise<ServerChat[]> {
  try {
    const res = await apiRequest("GET", "/api/chats");
    if (!res.ok) return [];
    const data = await res.json();
    return data.chats || [];
  } catch (e) {
    console.error("Failed to fetch chats:", e);
    return [];
  }
}

export async function fetchChatMessages(chatId: string, limit: number = 50, before?: string): Promise<ServerMessage[]> {
  try {
    let url = `/api/chats/${chatId}/messages?limit=${limit}`;
    if (before) url += `&before=${before}`;
    const res = await apiRequest("GET", url);
    if (!res.ok) return [];
    const data = await res.json();
    return data.messages || [];
  } catch (e) {
    console.error("Failed to fetch messages:", e);
    return [];
  }
}

export async function startChatWithContact(opts: {
  userId?: string;
  lekkerNetworkId?: string;
  phone?: string;
}): Promise<{ chat: ServerChat | null; message?: string; code?: string }> {
  try {
    const baseUrl = getApiUrl();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const token = getAuthToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(new URL("/api/chats/start-with-contact", baseUrl).toString(), {
      method: "POST",
      headers,
      body: JSON.stringify(opts),
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { chat: null, message: data.message || "Could not start chat", code: data.code };
    }
    return { chat: data.chat || null };
  } catch (e: any) {
    console.error("Failed to start chat with contact:", e);
    return { chat: null, message: e?.message || "Failed to start chat" };
  }
}

export interface MatchedRegisteredUser {
  phone: string;
  userId: string;
  firstName: string;
  lastName: string;
  username: string;
  avatarColor: string | null;
  profilePhoto: string | null;
  isVerifiedLekkerpreneur: boolean | null;
  businessName: string | null;
  presence: string | null;
}

/** WhatsApp-style: which of these phones are registered Lekker Chat accounts. */
export async function matchContacts(phones: string[]): Promise<MatchedRegisteredUser[]> {
  try {
    if (!phones.length) return [];
    // Chunk large address books so we stay under the API max (1000)
    const chunkSize = 400;
    const all: MatchedRegisteredUser[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < phones.length; i += chunkSize) {
      const chunk = phones.slice(i, i + chunkSize);
      const res = await apiRequest("POST", "/api/contacts/match", { phones: chunk });
      const data = await res.json();
      for (const m of data.matches || []) {
        if (m?.userId && !seen.has(m.userId)) {
          seen.add(m.userId);
          all.push(m);
        }
      }
    }
    return all;
  } catch (e) {
    console.error("Failed to match contacts:", e);
    return [];
  }
}

export async function voteOnPoll(
  chatId: string,
  messageId: string,
  optionId: string,
): Promise<ServerMessage | null> {
  try {
    const res = await apiRequest(
      "POST",
      `/api/chats/${chatId}/messages/${messageId}/poll-vote`,
      { optionId },
    );
    const data = await res.json();
    return data.message || null;
  } catch (e) {
    console.error("Failed to vote on poll:", e);
    return null;
  }
}

export async function createP2PChat(participantId: string): Promise<ServerChat | null> {
  try {
    const res = await apiRequest("POST", "/api/chats", { participantId, type: "p2p" });
    if (!res.ok) return null;
    const data = await res.json();
    return data.chat || null;
  } catch (e) {
    console.error("Failed to create chat:", e);
    return null;
  }
}

export async function createGroupChat(
  name: string,
  participantIds: string[],
  opts?: { addCledwyn?: boolean },
): Promise<ServerChat | null> {
  try {
    const res = await apiRequest("POST", "/api/chats", {
      type: "group",
      name,
      participantIds,
      ...(opts?.addCledwyn ? { addCledwyn: true } : {}),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.chat || null;
  } catch (e) {
    console.error("Failed to create group:", e);
    return null;
  }
}

export async function addCledwynToChat(chatId: string): Promise<{ success: boolean; message?: string }> {
  try {
    const res = await apiRequest("POST", `/api/chats/${chatId}/add-cledwyn`, {});
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { success: false, message: data.message || "Failed" };
    return { success: true };
  } catch (e: any) {
    return { success: false, message: e?.message || "Failed" };
  }
}

export async function sendChatMessage(
  chatId: string,
  content: string,
  type: string = "text",
  extras?: Record<string, any>,
): Promise<{ message: ServerMessage | null; error?: string }> {
  try {
    const body: any = { content, type, ...extras };
    const res = await apiRequest("POST", `/api/chats/${chatId}/messages`, body);
    const data = await res.json().catch(() => ({}));
    // apiRequest already throws on !ok; still guard malformed success bodies.
    const message = data?.message;
    if (!message || typeof message !== "object" || !message.id) {
      return {
        message: null,
        error:
          typeof data?.message === "string"
            ? data.message
            : "Message not sent. Please try again.",
      };
    }
    return { message };
  } catch (e: any) {
    console.error("Failed to send message:", e);
    const msg = String(e?.message || "Failed to send");
    const offline =
      /abort|network|failed to fetch|timeout|internet|connection/i.test(msg)
        ? "Couldn't reach Lekker Chat. Check your internet and try again."
        : msg.includes("403")
          ? "Message blocked — verify your phone in Settings, or you may be blocked."
          : "Message not sent. Please try again.";
    return { message: null, error: offline };
  }
}

export async function markChatRead(chatId: string): Promise<void> {
  try {
    await apiRequest("POST", `/api/chats/${chatId}/read`);
  } catch (e) {
    console.error("Failed to mark read:", e);
  }
}

export async function deleteServerChat(chatId: string): Promise<boolean> {
  try {
    const res = await apiRequest("DELETE", `/api/chats/${chatId}`);
    return res.ok;
  } catch (e) {
    console.error("Failed to delete chat:", e);
    return false;
  }
}

export async function editMessage(chatId: string, messageId: string, content: string): Promise<ServerMessage | null> {
  try {
    const res = await apiRequest("PUT", `/api/chats/${chatId}/messages/${messageId}`, { content });
    if (!res.ok) return null;
    const data = await res.json();
    return data.message || null;
  } catch (e) {
    console.error("Failed to edit message:", e);
    return null;
  }
}

export async function deleteMessage(chatId: string, messageId: string): Promise<boolean> {
  try {
    const res = await apiRequest("DELETE", `/api/chats/${chatId}/messages/${messageId}`);
    return res.ok;
  } catch (e) {
    console.error("Failed to delete message:", e);
    return false;
  }
}

export async function searchUsers(query: string): Promise<SearchUser[]> {
  try {
    const res = await apiRequest("GET", `/api/users/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.users || [];
  } catch (e) {
    console.error("Failed to search users:", e);
    return [];
  }
}

export async function getChatDetail(chatId: string): Promise<{ chat: ServerChat; participants: ChatParticipant[] } | null> {
  try {
    const res = await apiRequest("GET", `/api/chats/${chatId}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.chat ? { chat: data.chat, participants: data.chat.participants || [] } : null;
  } catch (e) {
    console.error("Failed to get chat detail:", e);
    return null;
  }
}

export function getDisplayName(participant: ChatParticipant): string {
  const combined = `${participant.firstName || ""} ${participant.lastName || ""}`.trim();
  if (combined && combined.toLowerCase() !== "user") return combined;
  // Phone is primary identity when name/username not set yet
  return participant.username || (participant as any).phone || "User";
}

export function isQuickNotesChat(chat: Pick<ServerChat, "type" | "name">): boolean {
  return chat.type === "notes" || chat.name === "Quick Notes";
}

export function getChatDisplayName(chat: ServerChat, myUserId: string): string {
  if (isQuickNotesChat(chat)) return "Quick Notes";
  if (chat.type === "group" && chat.name) return chat.name;
  const other = chat.participants.find(p => p.id !== myUserId);
  if (other) return getDisplayName(other);
  return "Chat";
}

export function getChatAvatarColor(chat: ServerChat, myUserId: string): string {
  if (isQuickNotesChat(chat)) return "#F5B800";
  if (chat.type === "group") return "#F5B800";
  const other = chat.participants.find(p => p.id !== myUserId);
  return other?.avatarColor || "#F5B800";
}

export function getChatProfilePhoto(chat: ServerChat, myUserId: string): string | null {
  if (isQuickNotesChat(chat) || chat.type === "group") return null;
  const other = chat.participants.find(p => p.id !== myUserId);
  return other?.profilePhoto || null;
}

export function getOtherParticipant(chat: ServerChat, myUserId: string): ChatParticipant | undefined {
  if (isQuickNotesChat(chat)) return undefined;
  return chat.participants.find(p => p.id !== myUserId);
}

export interface UserProfile {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  avatarColor: string | null;
  profilePhoto: string | null;
  isVerifiedLekkerpreneur: boolean;
  businessName: string | null;
  presence: string | null;
  bio: string | null;
  phone: string | null;
  createdAt: string;
}

export async function fetchUserProfile(userId: string): Promise<UserProfile | null> {
  try {
    const res = await apiRequest("GET", `/api/users/${userId}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.user || null;
  } catch (e) {
    console.error("Failed to fetch user profile:", e);
    return null;
  }
}

const PRESENCE_COLORS: Record<string, string> = {
  online: "#4CD964",
  away: "#FF9500",
  dnd: "#FF3B30",
  offline: "#666666",
};

const PRESENCE_LABELS: Record<string, string> = {
  online: "Online",
  away: "Away",
  dnd: "Do Not Disturb",
  offline: "Offline",
};

export function getPresenceColor(presence: string | null | undefined): string {
  return PRESENCE_COLORS[presence || "offline"] || PRESENCE_COLORS.offline;
}

export function getPresenceLabel(presence: string | null | undefined): string {
  return PRESENCE_LABELS[presence || "offline"] || PRESENCE_LABELS.offline;
}

export async function uploadChatAttachment(localUri: string, contentType?: string): Promise<string | null> {
  try {
    const uploadRes = await apiRequest("POST", "/api/objects/upload");
    if (!uploadRes.ok) return null;
    const { uploadURL } = await uploadRes.json();

    if (Platform.OS === "web") {
      const response = await globalThis.fetch(localUri);
      const blob = await response.blob();
      const putRes = await globalThis.fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": contentType || blob.type || "application/octet-stream" },
        body: blob,
      });
      if (!putRes.ok) return null;
    } else {
      const uploadResult = await FileSystem.uploadAsync(uploadURL, localUri, {
        httpMethod: "PUT",
        headers: { "Content-Type": contentType || "application/octet-stream" },
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      });
      if (uploadResult.status < 200 || uploadResult.status >= 300) return null;
    }

    const finalizeRes = await apiRequest("POST", "/api/chat-attachments/finalize", { uploadedURL: uploadURL });
    if (!finalizeRes.ok) return null;
    const { objectPath } = await finalizeRes.json();

    const baseUrl = getApiUrl();
    return `${baseUrl}${objectPath}`;
  } catch (e) {
    console.error("Failed to upload attachment:", e);
    return null;
  }
}
