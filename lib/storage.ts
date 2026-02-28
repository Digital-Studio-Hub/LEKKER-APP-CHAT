import AsyncStorage from "@react-native-async-storage/async-storage";
import { sendMessageNotification, setBadgeCount } from "@/lib/notifications";

const KEYS = {
  USER_PROFILE: "lekker_user_profile",
  CONVERSATIONS: "lekker_conversations",
  CLEDWYN_MESSAGES: "lekker_cledwyn_messages",
  FEED_POSTS: "lekker_feed_posts",
  CONTACTS: "lekker_contacts",
  BLOCKED_USERS: "lekker_blocked_users",
};

export interface BlockedUser {
  id: string;
  name: string;
  phone: string;
  blockedAt: string;
}

export interface UserProfile {
  id: string;
  phoneNumber: string;
  displayName: string;
  status: string;
  presence: "online" | "away" | "dnd" | "offline";
  lastSeen: string;
  avatarColor: string;
  profilePhoto?: string;
  lekkerNetworkAccess?: boolean;
  autoReplyEnabled?: boolean;
  autoReplyMessage?: string;
  notificationsEnabled?: boolean;
  locationEnabled?: boolean;
  lastLatitude?: number;
  lastLongitude?: number;
  locationCity?: string;
  locationRegion?: string;
}

export interface Contact {
  id: string;
  phoneNumber: string;
  displayName: string;
  avatarColor: string;
  isAppUser: boolean;
}

export type MessageStatus = "sent" | "delivered" | "seen";

export type MessageType = "text" | "image" | "file" | "voicenote" | "location" | "poll" | "contact";

export interface PollOption {
  id: string;
  text: string;
  votes: string[];
}

export interface ChatMessage {
  id: string;
  senderId: string;
  content: string;
  timestamp: string;
  read: boolean;
  status?: MessageStatus;
  type?: MessageType;
  imageUri?: string;
  fileUri?: string;
  fileName?: string;
  fileSize?: number;
  audioUri?: string;
  audioDuration?: number;
  latitude?: number;
  longitude?: number;
  locationName?: string;
  pollQuestion?: string;
  pollOptions?: PollOption[];
  sharedContactName?: string;
  sharedContactPhone?: string;
}

export interface GroupMember {
  id: string;
  name: string;
  phone: string;
  avatarColor: string;
}

export interface Conversation {
  id: string;
  contactId: string;
  contactName: string;
  contactAvatarColor: string;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  messages: ChatMessage[];
  pinned?: boolean;
  isGroup?: boolean;
  groupMembers?: GroupMember[];
  groupIcon?: string;
}

export interface CledwynMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface FeedPost {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatarColor: string;
  content: string;
  mediaUrl?: string;
  createdAt: string;
  likes: string[];
  comments: FeedComment[];
  shares: string[];
  contentHash: string;
}

export interface FeedComment {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: string;
}

function generateId(): string {
  return (
    Date.now().toString() + Math.random().toString(36).substr(2, 9)
  );
}

function hashContent(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return hash.toString(36);
}

const AVATAR_COLORS = [
  "#FF6B6B",
  "#4ECDC4",
  "#45B7D1",
  "#96CEB4",
  "#FFEAA7",
  "#DDA0DD",
  "#98D8C8",
  "#F7DC6F",
  "#BB8FCE",
  "#85C1E9",
];

function randomAvatarColor(): string {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}

export const storage = {
  async getUserProfile(): Promise<UserProfile | null> {
    const data = await AsyncStorage.getItem(KEYS.USER_PROFILE);
    return data ? JSON.parse(data) : null;
  },

  async saveUserProfile(profile: UserProfile): Promise<void> {
    await AsyncStorage.setItem(KEYS.USER_PROFILE, JSON.stringify(profile));
  },

  async createUserProfile(
    phoneNumber: string,
    displayName: string,
  ): Promise<UserProfile> {
    const profile: UserProfile = {
      id: generateId(),
      phoneNumber,
      displayName,
      status: "Hey there! I'm using Lekker Chat",
      presence: "online",
      lastSeen: new Date().toISOString(),
      avatarColor: randomAvatarColor(),
      autoReplyEnabled: false,
      autoReplyMessage: "Hi! I'm currently unavailable. I'll get back to you as soon as possible.",
    };
    await this.saveUserProfile(profile);
    return profile;
  },

  async getConversations(): Promise<Conversation[]> {
    const data = await AsyncStorage.getItem(KEYS.CONVERSATIONS);
    const convs: Conversation[] = data ? JSON.parse(data) : [];
    const pinned = convs.filter((c) => c.pinned);
    const unpinned = convs.filter((c) => !c.pinned);
    return [...pinned, ...unpinned];
  },

  async saveConversations(conversations: Conversation[]): Promise<void> {
    await AsyncStorage.setItem(
      KEYS.CONVERSATIONS,
      JSON.stringify(conversations),
    );
  },

  async addConversation(
    contactName: string,
    contactPhone: string,
  ): Promise<Conversation> {
    const conversations = await this.getConversations();
    const existing = conversations.find(
      (c) => c.contactId === contactPhone,
    );
    if (existing) return existing;

    const conversation: Conversation = {
      id: generateId(),
      contactId: contactPhone,
      contactName,
      contactAvatarColor: randomAvatarColor(),
      lastMessage: "",
      lastMessageTime: new Date().toISOString(),
      unreadCount: 0,
      messages: [],
      pinned: false,
      isGroup: false,
    };
    conversations.unshift(conversation);
    await this.saveConversations(conversations);
    return conversation;
  },

  async createGroupConversation(
    groupName: string,
    members: GroupMember[],
  ): Promise<Conversation> {
    const conversations = await this.getConversations();
    const conversation: Conversation = {
      id: generateId(),
      contactId: `group_${generateId()}`,
      contactName: groupName,
      contactAvatarColor: randomAvatarColor(),
      lastMessage: "",
      lastMessageTime: new Date().toISOString(),
      unreadCount: 0,
      messages: [],
      pinned: false,
      isGroup: true,
      groupMembers: members,
    };
    conversations.unshift(conversation);
    await this.saveConversations(conversations);
    return conversation;
  },

  async togglePinConversation(conversationId: string): Promise<boolean> {
    const conversations = await this.getConversations();
    const conv = conversations.find((c) => c.id === conversationId);
    if (!conv) return false;
    conv.pinned = !conv.pinned;
    await this.saveConversations(conversations);
    return conv.pinned;
  },

  async addMessageToConversation(
    conversationId: string,
    content: string,
    senderId: string,
    attachment?: Partial<ChatMessage>,
  ): Promise<ChatMessage> {
    const conversations = await this.getConversations();
    const conv = conversations.find((c) => c.id === conversationId);
    if (!conv) throw new Error("Conversation not found");

    if (senderId !== "me" && !conv.isGroup) {
      const blocked = await this.isUserBlocked(conv.contactId);
      if (blocked) {
        throw new Error("User is blocked");
      }
    }

    const message: ChatMessage = {
      id: generateId(),
      senderId,
      content,
      timestamp: new Date().toISOString(),
      read: senderId === "me",
      status: senderId === "me" ? "sent" : undefined,
      type: attachment?.type || "text",
      ...attachment,
    };

    conv.messages.push(message);
    conv.lastMessage = content;
    conv.lastMessageTime = message.timestamp;
    if (senderId !== "me") {
      conv.unreadCount++;
      sendMessageNotification(conv.contactName, content, conversationId);
      const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);
      setBadgeCount(totalUnread);
    }

    if (senderId === "me") {
      setTimeout(async () => {
        await this.updateMessageStatus(conversationId, message.id, "delivered");
      }, 800 + Math.random() * 1200);

      setTimeout(async () => {
        await this.updateMessageStatus(conversationId, message.id, "seen");
      }, 2500 + Math.random() * 2000);
    }

    const idx = conversations.indexOf(conv);
    if (!conv.pinned) {
      conversations.splice(idx, 1);
      const pinnedCount = conversations.filter((c) => c.pinned).length;
      conversations.splice(pinnedCount, 0, conv);
    }

    await this.saveConversations(conversations);

    if (senderId === "me") {
      const profile = await this.getUserProfile();
      if (profile?.autoReplyEnabled && profile.autoReplyMessage) {
        setTimeout(async () => {
          try {
            await this.addMessageToConversation(
              conversationId,
              profile.autoReplyMessage!,
              conv.contactId,
            );
          } catch (e) {}
        }, 2000 + Math.random() * 3000);
      }
    }

    return message;
  },

  async updateMessageStatus(
    conversationId: string,
    messageId: string,
    status: MessageStatus,
  ): Promise<void> {
    const conversations = await this.getConversations();
    const conv = conversations.find((c) => c.id === conversationId);
    if (!conv) return;
    const msg = conv.messages.find((m) => m.id === messageId);
    if (!msg) return;
    msg.status = status;
    if (status === "seen") msg.read = true;
    await this.saveConversations(conversations);
  },

  async votePoll(
    conversationId: string,
    messageId: string,
    optionId: string,
    voterId: string,
  ): Promise<void> {
    const conversations = await this.getConversations();
    const conv = conversations.find((c) => c.id === conversationId);
    if (!conv) return;
    const msg = conv.messages.find((m) => m.id === messageId);
    if (!msg || msg.type !== "poll" || !msg.pollOptions) return;
    for (const opt of msg.pollOptions) {
      opt.votes = opt.votes.filter((v) => v !== voterId);
    }
    const option = msg.pollOptions.find((o) => o.id === optionId);
    if (option) {
      option.votes.push(voterId);
    }
    await this.saveConversations(conversations);
  },

  async markConversationSeen(conversationId: string): Promise<void> {
    const conversations = await this.getConversations();
    const conv = conversations.find((c) => c.id === conversationId);
    if (!conv) return;
    let changed = false;
    for (const msg of conv.messages) {
      if (msg.senderId !== "me" && !msg.read) {
        msg.read = true;
        changed = true;
      }
    }
    if (changed) {
      conv.unreadCount = 0;
      await this.saveConversations(conversations);
    }
  },

  async deleteConversation(conversationId: string): Promise<void> {
    const conversations = await this.getConversations();
    const filtered = conversations.filter((c) => c.id !== conversationId);
    await this.saveConversations(filtered);
  },

  async getCledwynMessages(): Promise<CledwynMessage[]> {
    const data = await AsyncStorage.getItem(KEYS.CLEDWYN_MESSAGES);
    return data ? JSON.parse(data) : [];
  },

  async saveCledwynMessages(messages: CledwynMessage[]): Promise<void> {
    await AsyncStorage.setItem(
      KEYS.CLEDWYN_MESSAGES,
      JSON.stringify(messages),
    );
  },

  async getFeedPosts(): Promise<FeedPost[]> {
    const data = await AsyncStorage.getItem(KEYS.FEED_POSTS);
    const posts: FeedPost[] = data ? JSON.parse(data) : [];
    const now = Date.now();
    const twentyFourHours = 24 * 60 * 60 * 1000;
    const filtered = posts.filter((p) => {
      const isShared = p.shares.length > 0;
      if (isShared) return true;
      return now - new Date(p.createdAt).getTime() < twentyFourHours;
    });
    if (filtered.length !== posts.length) {
      await this.saveFeedPosts(filtered);
    }
    return filtered;
  },

  async saveFeedPosts(posts: FeedPost[]): Promise<void> {
    await AsyncStorage.setItem(KEYS.FEED_POSTS, JSON.stringify(posts));
  },

  async createFeedPost(
    authorId: string,
    authorName: string,
    authorAvatarColor: string,
    content: string,
    mediaUrl?: string,
  ): Promise<FeedPost | null> {
    const posts = await this.getFeedPosts();
    const contentHash = hashContent(content.toLowerCase().trim());
    const now = Date.now();
    const twentyFourHours = 24 * 60 * 60 * 1000;

    const isDuplicate = posts.some(
      (p) =>
        p.authorId === authorId &&
        p.contentHash === contentHash &&
        now - new Date(p.createdAt).getTime() < twentyFourHours,
    );

    if (isDuplicate) return null;

    const post: FeedPost = {
      id: generateId(),
      authorId,
      authorName,
      authorAvatarColor,
      content,
      mediaUrl,
      createdAt: new Date().toISOString(),
      likes: [],
      comments: [],
      shares: [],
      contentHash,
    };
    posts.unshift(post);
    await this.saveFeedPosts(posts);
    return post;
  },

  async toggleLike(postId: string, userId: string): Promise<void> {
    const posts = await this.getFeedPosts();
    const post = posts.find((p) => p.id === postId);
    if (!post) return;

    const idx = post.likes.indexOf(userId);
    if (idx >= 0) {
      post.likes.splice(idx, 1);
    } else {
      post.likes.push(userId);
    }
    await this.saveFeedPosts(posts);
  },

  async addComment(
    postId: string,
    authorId: string,
    authorName: string,
    content: string,
  ): Promise<void> {
    const posts = await this.getFeedPosts();
    const post = posts.find((p) => p.id === postId);
    if (!post) return;

    post.comments.push({
      id: generateId(),
      authorId,
      authorName,
      content,
      createdAt: new Date().toISOString(),
    });
    await this.saveFeedPosts(posts);
  },

  async sharePost(postId: string, userId: string): Promise<void> {
    const posts = await this.getFeedPosts();
    const post = posts.find((p) => p.id === postId);
    if (!post) return;

    if (!post.shares.includes(userId)) {
      post.shares.push(userId);
    }
    await this.saveFeedPosts(posts);
  },

  async getContacts(): Promise<Contact[]> {
    const data = await AsyncStorage.getItem(KEYS.CONTACTS);
    return data ? JSON.parse(data) : [];
  },

  async addContact(name: string, phone: string): Promise<Contact> {
    const contacts = await this.getContacts();
    const existing = contacts.find((c) => c.phoneNumber === phone);
    if (existing) return existing;

    const contact: Contact = {
      id: generateId(),
      phoneNumber: phone,
      displayName: name,
      avatarColor: randomAvatarColor(),
      isAppUser: Math.random() > 0.5,
    };
    contacts.push(contact);
    await AsyncStorage.setItem(KEYS.CONTACTS, JSON.stringify(contacts));
    return contact;
  },

  async getBlockedUsers(): Promise<BlockedUser[]> {
    const data = await AsyncStorage.getItem(KEYS.BLOCKED_USERS);
    return data ? JSON.parse(data) : [];
  },

  async blockUser(name: string, phone: string): Promise<void> {
    const blocked = await this.getBlockedUsers();
    if (blocked.some((b) => b.phone === phone)) return;
    blocked.push({
      id: generateId(),
      name,
      phone,
      blockedAt: new Date().toISOString(),
    });
    await AsyncStorage.setItem(KEYS.BLOCKED_USERS, JSON.stringify(blocked));
  },

  async unblockUser(phone: string): Promise<void> {
    const blocked = await this.getBlockedUsers();
    const filtered = blocked.filter((b) => b.phone !== phone);
    await AsyncStorage.setItem(KEYS.BLOCKED_USERS, JSON.stringify(filtered));
  },

  async isUserBlocked(phone: string): Promise<boolean> {
    const blocked = await this.getBlockedUsers();
    return blocked.some((b) => b.phone === phone);
  },

  async clearAll(): Promise<void> {
    await AsyncStorage.multiRemove(Object.values(KEYS));
  },
};
