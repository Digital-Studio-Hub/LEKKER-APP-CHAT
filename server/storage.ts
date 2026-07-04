import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, or, and, ne, sql, asc, desc, count, inArray, gt, isNull, lt } from "drizzle-orm";
import {
  users, authAuditLogs, chats, chatParticipants, chatMessages, userEmails,
  userBlocks, contentReports,
  type User, type InsertUser, type Chat, type ChatParticipant, type ChatMessage, type UserEmail,
} from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on("error", (err) => {
  console.error("[DB Pool] Unexpected client error (connection will be recycled):", err.message);
});

export const db = drizzle(pool);

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByPhone(phone: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByIdentifier(identifier: string): Promise<User | undefined>;
  getUserByLekkerNetworkId(lekkerNetworkId: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User | undefined>;
  getVerifiedUsers(excludeId: string, page: number, limit: number): Promise<{ users: User[]; total: number }>;
  logAuthEvent(event: string, userId?: string, ipAddress?: string, userAgent?: string, details?: string): Promise<void>;
  getUserEmails(userId: string): Promise<UserEmail[]>;
  addUserEmail(userId: string, email: string, isPrimary: boolean, isVerified: boolean): Promise<UserEmail>;
  removeUserEmail(emailId: string, userId: string): Promise<boolean>;
  verifyUserEmail(emailId: string, userId: string): Promise<void>;
  emailExistsAnywhere(email: string): Promise<boolean>;

  createChat(type: string, createdBy: string, name?: string): Promise<Chat>;
  addChatParticipant(chatId: string, userId: string, role?: string): Promise<ChatParticipant>;
  removeChatParticipant(chatId: string, userId: string): Promise<void>;
  isUserInChat(chatId: string, userId: string): Promise<boolean>;
  getUserChats(userId: string): Promise<Array<Chat & { participants: Array<{ userId: string; role: string }>; lastMessage?: ChatMessage; unreadCount: number }>>;
  findExistingP2PChat(userId1: string, userId2: string): Promise<Chat | undefined>;
  getChatMessages(chatId: string, limit?: number, before?: string): Promise<ChatMessage[]>;
  sendMessage(chatId: string, senderId: string, content: string | null, type?: string, extras?: Partial<ChatMessage>): Promise<ChatMessage>;
  markMessagesRead(chatId: string, userId: string): Promise<void>;
  updateMessageStatus(messageId: string, status: string): Promise<ChatMessage | undefined>;
  getChatParticipants(chatId: string): Promise<Array<ChatParticipant & { user?: Partial<User> }>>;
  getChat(chatId: string): Promise<Chat | undefined>;
  deleteChat(chatId: string): Promise<void>;

  blockUser(blockerId: string, blockedUserId: string): Promise<void>;
  unblockUser(blockerId: string, blockedUserId: string): Promise<void>;
  getBlockedUsers(blockerId: string): Promise<Array<{ id: string; blockedUserId: string; name: string; createdAt: Date }>>;
  isEitherUserBlocked(userId1: string, userId2: string): Promise<boolean>;

  createContentReport(input: {
    reporterId: string;
    reportedUserId?: string | null;
    messageId?: string | null;
    chatId?: string | null;
    reportType: string;
    reason: string;
    details?: string | null;
  }): Promise<{ id: string }>;
}

class PgStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const normalized = email.toLowerCase();
    const [emailRecord] = await db.select().from(userEmails).where(eq(userEmails.email, normalized)).limit(1);
    if (emailRecord) return this.getUser(emailRecord.userId);
    const [user] = await db.select().from(users).where(eq(users.email, normalized)).limit(1);
    return user;
  }

  async getUserByPhone(phone: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username.toLowerCase())).limit(1);
    return user;
  }

  async getUserByLekkerNetworkId(lekkerNetworkId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users)
      .where(eq(users.lekkerNetworkId, lekkerNetworkId))
      .limit(1);
    return user;
  }

  async getUserByIdentifier(identifier: string): Promise<User | undefined> {
    const normalized = identifier.toLowerCase();
    const [byPhoneOrUsername] = await db.select().from(users).where(
      or(
        eq(users.phone, identifier),
        eq(users.username, normalized)
      )
    ).limit(1);
    if (byPhoneOrUsername) return byPhoneOrUsername;
    const [emailRecord] = await db.select().from(userEmails).where(eq(userEmails.email, normalized)).limit(1);
    if (emailRecord) return this.getUser(emailRecord.userId);
    const [byLegacyEmail] = await db.select().from(users).where(eq(users.email, normalized)).limit(1);
    return byLegacyEmail;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values({
      ...insertUser,
      email: insertUser.email.toLowerCase(),
      username: insertUser.username.toLowerCase(),
    }).returning();
    return user;
  }

  async updateUser(id: string, data: Partial<User>): Promise<User | undefined> {
    const updateData = { ...data, updatedAt: new Date() };
    const [user] = await db.update(users)
      .set(updateData)
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async getVerifiedUsers(excludeId: string, page: number, limit: number): Promise<{ users: User[]; total: number }> {
    const whereClause = and(
      eq(users.isVerifiedLekkerpreneur, true),
      ne(users.id, excludeId)
    );

    const [totalResult] = await db.select({ value: count() }).from(users).where(whereClause);
    const total = totalResult?.value || 0;

    const offset = (page - 1) * limit;
    const results = await db.select().from(users)
      .where(whereClause)
      .orderBy(desc(users.lekkerVerifiedAt), asc(users.businessName))
      .limit(limit)
      .offset(offset);

    return { users: results, total };
  }

  async getUserEmails(userId: string): Promise<UserEmail[]> {
    return db.select().from(userEmails).where(eq(userEmails.userId, userId)).orderBy(userEmails.createdAt);
  }

  async addUserEmail(userId: string, email: string, isPrimary: boolean, isVerified: boolean): Promise<UserEmail> {
    const [record] = await db.insert(userEmails).values({
      userId,
      email: email.toLowerCase(),
      isPrimary,
      isVerified,
      verifiedAt: isVerified ? new Date() : null,
    }).returning();
    return record;
  }

  async removeUserEmail(emailId: string, userId: string): Promise<boolean> {
    const [record] = await db.select().from(userEmails).where(
      and(eq(userEmails.id, emailId), eq(userEmails.userId, userId))
    ).limit(1);
    if (!record) return false;
    if (record.isPrimary) return false;
    await db.delete(userEmails).where(and(eq(userEmails.id, emailId), eq(userEmails.userId, userId)));
    return true;
  }

  async verifyUserEmail(emailId: string, userId: string): Promise<void> {
    await db.update(userEmails).set({ isVerified: true, verifiedAt: new Date() })
      .where(and(eq(userEmails.id, emailId), eq(userEmails.userId, userId)));
    await db.update(users).set({ emailVerified: true, updatedAt: new Date() }).where(eq(users.id, userId));
  }

  async emailExistsAnywhere(email: string): Promise<boolean> {
    const normalized = email.toLowerCase();
    const [record] = await db.select({ id: userEmails.id }).from(userEmails).where(eq(userEmails.email, normalized)).limit(1);
    if (record) return true;
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, normalized)).limit(1);
    return !!user;
  }

  async logAuthEvent(
    event: string,
    userId?: string,
    ipAddress?: string,
    userAgent?: string,
    details?: string
  ): Promise<void> {
    await db.insert(authAuditLogs).values({
      userId: userId || null,
      event,
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
      details: details || null,
    });
  }

  async createChat(type: string, createdBy: string, name?: string): Promise<Chat> {
    const [chat] = await db.insert(chats).values({
      type,
      createdBy,
      name: name || null,
    }).returning();
    return chat;
  }

  async addChatParticipant(chatId: string, userId: string, role: string = "member"): Promise<ChatParticipant> {
    const [participant] = await db.insert(chatParticipants).values({
      chatId,
      userId,
      role,
    }).returning();
    return participant;
  }

  async removeChatParticipant(chatId: string, userId: string): Promise<void> {
    await db.delete(chatParticipants).where(
      and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.userId, userId))
    );
  }

  async isUserInChat(chatId: string, userId: string): Promise<boolean> {
    const [p] = await db.select({ id: chatParticipants.id })
      .from(chatParticipants)
      .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.userId, userId)))
      .limit(1);
    return !!p;
  }

  async findExistingP2PChat(userId1: string, userId2: string): Promise<Chat | undefined> {
    const result = await db.execute(sql`
      SELECT c.* FROM chats c
      WHERE c.type = 'p2p'
        AND EXISTS (SELECT 1 FROM chat_participants cp1 WHERE cp1.chat_id = c.id AND cp1.user_id = ${userId1})
        AND EXISTS (SELECT 1 FROM chat_participants cp2 WHERE cp2.chat_id = c.id AND cp2.user_id = ${userId2})
      LIMIT 1
    `);
    if (result.rows && result.rows.length > 0) {
      const row = result.rows[0] as any;
      return {
        id: row.id,
        type: row.type,
        name: row.name,
        createdBy: row.created_by,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
      };
    }
    return undefined;
  }

  async getUserChats(userId: string): Promise<Array<Chat & { participants: Array<{ userId: string; role: string }>; lastMessage?: ChatMessage; unreadCount: number }>> {
    const userParticipations = await db.select()
      .from(chatParticipants)
      .where(eq(chatParticipants.userId, userId));

    if (userParticipations.length === 0) return [];

    const chatIds = userParticipations.map(p => p.chatId);

    const chatRows = await db.select().from(chats).where(inArray(chats.id, chatIds));

    const allParticipants = await db.select({
      chatId: chatParticipants.chatId,
      userId: chatParticipants.userId,
      role: chatParticipants.role,
    }).from(chatParticipants).where(inArray(chatParticipants.chatId, chatIds));

    const results: Array<Chat & { participants: Array<{ userId: string; role: string }>; lastMessage?: ChatMessage; unreadCount: number }> = [];

    for (const chat of chatRows) {
      const chatParts = allParticipants.filter(p => p.chatId === chat.id);

      const [lastMsg] = await db.select().from(chatMessages)
        .where(eq(chatMessages.chatId, chat.id))
        .orderBy(desc(chatMessages.createdAt))
        .limit(1);

      const myParticipation = userParticipations.find(p => p.chatId === chat.id);
      let unreadCount = 0;
      if (myParticipation) {
        const unreadWhere = myParticipation.lastReadAt
          ? and(
              eq(chatMessages.chatId, chat.id),
              ne(chatMessages.senderId, userId),
              gt(chatMessages.createdAt, myParticipation.lastReadAt)
            )
          : and(
              eq(chatMessages.chatId, chat.id),
              ne(chatMessages.senderId, userId)
            );
        const [unreadResult] = await db.select({ value: count() }).from(chatMessages).where(unreadWhere);
        unreadCount = unreadResult?.value || 0;
      }

      results.push({
        ...chat,
        participants: chatParts,
        lastMessage: lastMsg || undefined,
        unreadCount,
      });
    }

    results.sort((a, b) => {
      const aTime = a.lastMessage?.createdAt?.getTime() || a.createdAt.getTime();
      const bTime = b.lastMessage?.createdAt?.getTime() || b.createdAt.getTime();
      return bTime - aTime;
    });

    return results;
  }

  async getChatMessages(chatId: string, limit: number = 50, before?: string): Promise<ChatMessage[]> {
    let whereClause;
    if (before) {
      const [refMsg] = await db.select({ createdAt: chatMessages.createdAt })
        .from(chatMessages).where(eq(chatMessages.id, before)).limit(1);
      if (refMsg) {
        whereClause = and(eq(chatMessages.chatId, chatId), lt(chatMessages.createdAt, refMsg.createdAt));
      } else {
        whereClause = eq(chatMessages.chatId, chatId);
      }
    } else {
      whereClause = eq(chatMessages.chatId, chatId);
    }

    const messages = await db.select().from(chatMessages)
      .where(whereClause)
      .orderBy(desc(chatMessages.createdAt))
      .limit(limit);

    return messages.reverse();
  }

  async sendMessage(chatId: string, senderId: string, content: string | null, type: string = "text", extras?: Partial<ChatMessage>): Promise<ChatMessage> {
    const values: any = {
      chatId,
      senderId,
      content,
      type,
      status: "sent",
    };

    if (extras) {
      if (extras.imageUri) values.imageUri = extras.imageUri;
      if (extras.fileUri) values.fileUri = extras.fileUri;
      if (extras.fileName) values.fileName = extras.fileName;
      if (extras.fileSize) values.fileSize = extras.fileSize;
      if (extras.audioUri) values.audioUri = extras.audioUri;
      if (extras.audioDuration) values.audioDuration = extras.audioDuration;
      if (extras.waveformData) values.waveformData = extras.waveformData;
      if (extras.latitude) values.latitude = extras.latitude;
      if (extras.longitude) values.longitude = extras.longitude;
      if (extras.locationName) values.locationName = extras.locationName;
      if (extras.pollQuestion) values.pollQuestion = extras.pollQuestion;
      if (extras.pollOptions) values.pollOptions = extras.pollOptions;
      if (extras.sharedContactName) values.sharedContactName = extras.sharedContactName;
      if (extras.sharedContactPhone) values.sharedContactPhone = extras.sharedContactPhone;
    }

    const [message] = await db.insert(chatMessages).values(values).returning();

    await db.update(chats).set({ updatedAt: new Date() }).where(eq(chats.id, chatId));

    return message;
  }

  async markMessagesRead(chatId: string, userId: string): Promise<void> {
    await db.update(chatMessages)
      .set({ status: "seen" })
      .where(
        and(
          eq(chatMessages.chatId, chatId),
          ne(chatMessages.senderId, userId),
          ne(chatMessages.status, "seen")
        )
      );

    await db.update(chatParticipants)
      .set({ lastReadAt: new Date() })
      .where(
        and(
          eq(chatParticipants.chatId, chatId),
          eq(chatParticipants.userId, userId)
        )
      );
  }

  async updateMessageStatus(messageId: string, status: string): Promise<ChatMessage | undefined> {
    const [msg] = await db.update(chatMessages)
      .set({ status })
      .where(eq(chatMessages.id, messageId))
      .returning();
    return msg;
  }

  async getChatParticipants(chatId: string): Promise<Array<ChatParticipant & { user?: Partial<User> }>> {
    const parts = await db.select().from(chatParticipants)
      .where(eq(chatParticipants.chatId, chatId));

    const userIds = parts.map(p => p.userId);
    if (userIds.length === 0) return [];

    const usersData = await db.select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      username: users.username,
      avatarColor: users.avatarColor,
      profilePhoto: users.profilePhoto,
      isVerifiedLekkerpreneur: users.isVerifiedLekkerpreneur,
      businessName: users.businessName,
      presence: users.presence,
    }).from(users).where(inArray(users.id, userIds));

    return parts.map(p => ({
      ...p,
      user: usersData.find(u => u.id === p.userId),
    }));
  }

  async getChat(chatId: string): Promise<Chat | undefined> {
    const [chat] = await db.select().from(chats).where(eq(chats.id, chatId)).limit(1);
    return chat;
  }

  async deleteChat(chatId: string): Promise<void> {
    await db.delete(chatMessages).where(eq(chatMessages.chatId, chatId));
    await db.delete(chatParticipants).where(eq(chatParticipants.chatId, chatId));
    await db.delete(chats).where(eq(chats.id, chatId));
  }

  async blockUser(blockerId: string, blockedUserId: string): Promise<void> {
    if (blockerId === blockedUserId) return;
    await db.insert(userBlocks).values({ blockerId, blockedUserId }).onConflictDoNothing();
  }

  async unblockUser(blockerId: string, blockedUserId: string): Promise<void> {
    await db.delete(userBlocks).where(
      and(eq(userBlocks.blockerId, blockerId), eq(userBlocks.blockedUserId, blockedUserId)),
    );
  }

  async getBlockedUsers(blockerId: string): Promise<Array<{ id: string; blockedUserId: string; name: string; createdAt: Date }>> {
    const rows = await db.select({
      id: userBlocks.id,
      blockedUserId: userBlocks.blockedUserId,
      createdAt: userBlocks.createdAt,
      firstName: users.firstName,
      lastName: users.lastName,
      username: users.username,
    })
      .from(userBlocks)
      .innerJoin(users, eq(users.id, userBlocks.blockedUserId))
      .where(eq(userBlocks.blockerId, blockerId))
      .orderBy(desc(userBlocks.createdAt));

    return rows.map((r) => ({
      id: r.id,
      blockedUserId: r.blockedUserId,
      name: `${r.firstName} ${r.lastName}`.trim() || r.username,
      createdAt: r.createdAt,
    }));
  }

  async isEitherUserBlocked(userId1: string, userId2: string): Promise<boolean> {
    const [row] = await db.select({ id: userBlocks.id }).from(userBlocks).where(
      or(
        and(eq(userBlocks.blockerId, userId1), eq(userBlocks.blockedUserId, userId2)),
        and(eq(userBlocks.blockerId, userId2), eq(userBlocks.blockedUserId, userId1)),
      ),
    ).limit(1);
    return !!row;
  }

  async createContentReport(input: {
    reporterId: string;
    reportedUserId?: string | null;
    messageId?: string | null;
    chatId?: string | null;
    reportType: string;
    reason: string;
    details?: string | null;
  }): Promise<{ id: string }> {
    const [row] = await db.insert(contentReports).values({
      reporterId: input.reporterId,
      reportedUserId: input.reportedUserId ?? null,
      messageId: input.messageId ?? null,
      chatId: input.chatId ?? null,
      reportType: input.reportType,
      reason: input.reason,
      details: input.details ?? null,
      status: "open",
    }).returning({ id: contentReports.id });
    return { id: row.id };
  }

  async deleteUserAccount(userId: string): Promise<void> {
    const userChats = await db
      .select({ chatId: chatParticipants.chatId })
      .from(chatParticipants)
      .where(eq(chatParticipants.userId, userId));

    for (const { chatId } of userChats) {
      const participants = await db
        .select()
        .from(chatParticipants)
        .where(eq(chatParticipants.chatId, chatId));
      if (participants.length <= 2) {
        await db.delete(chatMessages).where(eq(chatMessages.chatId, chatId));
        await db.delete(chatParticipants).where(eq(chatParticipants.chatId, chatId));
        await db.delete(chats).where(eq(chats.id, chatId));
      } else {
        await db.delete(chatParticipants).where(
          and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.userId, userId))
        );
        await db.delete(chatMessages).where(
          and(eq(chatMessages.chatId, chatId), eq(chatMessages.senderId, userId))
        );
      }
    }

    await db.delete(userBlocks).where(
      or(eq(userBlocks.blockerId, userId), eq(userBlocks.blockedUserId, userId)),
    );
    await db.delete(contentReports).where(
      or(eq(contentReports.reporterId, userId), eq(contentReports.reportedUserId, userId)),
    );
    await db.delete(authAuditLogs).where(eq(authAuditLogs.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
  }
}

export const storage = new PgStorage();
