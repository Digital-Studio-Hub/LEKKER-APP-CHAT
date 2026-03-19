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

export async function createGroupChat(name: string, participantIds: string[]): Promise<ServerChat | null> {
  try {
    const res = await apiRequest("POST", "/api/chats", { type: "group", name, participantIds });
    if (!res.ok) return null;
    const data = await res.json();
    return data.chat || null;
  } catch (e) {
    console.error("Failed to create group:", e);
    return null;
  }
}

export async function sendChatMessage(chatId: string, content: string, type: string = "text", extras?: Record<string, any>): Promise<ServerMessage | null> {
  try {
    const body: any = { content, type, ...extras };
    const res = await apiRequest("POST", `/api/chats/${chatId}/messages`, body);
    if (!res.ok) return null;
    const data = await res.json();
    return data.message || null;
  } catch (e) {
    console.error("Failed to send message:", e);
    return null;
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
  return `${participant.firstName} ${participant.lastName}`.trim() || participant.username;
}

export function getChatDisplayName(chat: ServerChat, myUserId: string): string {
  if (chat.type === "group" && chat.name) return chat.name;
  const other = chat.participants.find(p => p.id !== myUserId);
  if (other) return getDisplayName(other);
  return "Chat";
}

export function getChatAvatarColor(chat: ServerChat, myUserId: string): string {
  if (chat.type === "group") return "#F5B800";
  const other = chat.participants.find(p => p.id !== myUserId);
  return other?.avatarColor || "#F5B800";
}

export function getChatProfilePhoto(chat: ServerChat, myUserId: string): string | null {
  if (chat.type === "group") return null;
  const other = chat.participants.find(p => p.id !== myUserId);
  return other?.profilePhoto || null;
}

export function getOtherParticipant(chat: ServerChat, myUserId: string): ChatParticipant | undefined {
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
