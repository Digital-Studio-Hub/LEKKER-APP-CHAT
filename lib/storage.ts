import AsyncStorage from "@react-native-async-storage/async-storage";

const KEYS = {
  USER_PROFILE: "lekker_user_profile",
  CONVERSATIONS: "lekker_conversations",
  CLEDWYN_MESSAGES: "lekker_cledwyn_messages",
  FEED_POSTS: "lekker_feed_posts",
  CONTACTS: "lekker_contacts",
};

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
}

export interface Contact {
  id: string;
  phoneNumber: string;
  displayName: string;
  avatarColor: string;
  isAppUser: boolean;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  content: string;
  timestamp: string;
  read: boolean;
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
    };
    await this.saveUserProfile(profile);
    return profile;
  },

  async getConversations(): Promise<Conversation[]> {
    const data = await AsyncStorage.getItem(KEYS.CONVERSATIONS);
    return data ? JSON.parse(data) : [];
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
    };
    conversations.unshift(conversation);
    await this.saveConversations(conversations);
    return conversation;
  },

  async addMessageToConversation(
    conversationId: string,
    content: string,
    senderId: string,
  ): Promise<ChatMessage> {
    const conversations = await this.getConversations();
    const conv = conversations.find((c) => c.id === conversationId);
    if (!conv) throw new Error("Conversation not found");

    const message: ChatMessage = {
      id: generateId(),
      senderId,
      content,
      timestamp: new Date().toISOString(),
      read: senderId === "me",
    };

    conv.messages.push(message);
    conv.lastMessage = content;
    conv.lastMessageTime = message.timestamp;
    if (senderId !== "me") conv.unreadCount++;

    const idx = conversations.indexOf(conv);
    conversations.splice(idx, 1);
    conversations.unshift(conv);

    await this.saveConversations(conversations);
    return message;
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

  async clearAll(): Promise<void> {
    await AsyncStorage.multiRemove(Object.values(KEYS));
  },
};
