var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// shared/schema.ts
import { sql } from "drizzle-orm";
import { pgTable, text, varchar, boolean, timestamp, integer, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
var users, authAuditLogs, phoneVerificationCodes, emailVerificationCodes, userEmails, passwordResetCodes, chats, chatParticipants, userBlocks, contentReports, feedPosts, feedLikes, feedComments, feedShares, pushTokens, chatMessages, passwordSchema, registerSchema, loginSchema, updateProfileSchema, insertUserSchema;
var init_schema = __esm({
  "shared/schema.ts"() {
    "use strict";
    users = pgTable("users", {
      id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
      phone: varchar("phone", { length: 20 }).notNull().unique(),
      email: varchar("email", { length: 255 }).notNull().unique(),
      username: varchar("username", { length: 50 }).notNull().unique(),
      firstName: varchar("first_name", { length: 100 }).notNull(),
      lastName: varchar("last_name", { length: 100 }).notNull(),
      passwordHash: text("password_hash"),
      workspaceEmailActive: boolean("workspace_email_active").default(false),
      emailVerified: boolean("email_verified").default(false).notNull(),
      phoneVerified: boolean("phone_verified").default(false).notNull(),
      role: varchar("role", { length: 20 }).default("user").notNull(),
      avatarColor: varchar("avatar_color", { length: 10 }).default("#F5B800"),
      profilePhoto: text("profile_photo"),
      bio: text("bio"),
      businessName: varchar("business_name", { length: 255 }),
      tradingName: varchar("trading_name", { length: 255 }),
      lekkerNetworkId: varchar("lekker_network_id", { length: 100 }),
      lekkerWorkspaceId: varchar("lekker_workspace_id", { length: 100 }),
      isVerifiedLekkerpreneur: boolean("is_verified_lekkerpreneur").default(false),
      businessCategory: varchar("business_category", { length: 100 }),
      businessWebsite: varchar("business_website", { length: 500 }),
      businessLogoUrl: text("business_logo_url"),
      businessProvince: varchar("business_province", { length: 100 }),
      businessCountry: varchar("business_country", { length: 100 }),
      lekkerVerifiedAt: timestamp("lekker_verified_at"),
      status: text("status"),
      presence: varchar("presence", { length: 20 }).default("online"),
      lekkerNetworkAccess: boolean("lekker_network_access").default(false),
      autoReplyEnabled: boolean("auto_reply_enabled").default(false),
      autoReplyMessage: text("auto_reply_message"),
      notificationsEnabled: boolean("notifications_enabled").default(true),
      locationEnabled: boolean("location_enabled").default(false),
      lastLatitude: text("last_latitude"),
      lastLongitude: text("last_longitude"),
      locationCity: varchar("location_city", { length: 100 }),
      locationRegion: varchar("location_region", { length: 100 }),
      profileImageUpdatedAt: timestamp("profile_image_updated_at"),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (table) => [
      index("idx_users_verified").on(table.isVerifiedLekkerpreneur)
    ]);
    authAuditLogs = pgTable("auth_audit_logs", {
      id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
      userId: varchar("user_id", { length: 36 }),
      event: varchar("event", { length: 50 }).notNull(),
      ipAddress: varchar("ip_address", { length: 45 }),
      userAgent: text("user_agent"),
      details: text("details"),
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    phoneVerificationCodes = pgTable("phone_verification_codes", {
      id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
      phone: varchar("phone", { length: 20 }).notNull(),
      code: varchar("code", { length: 6 }).notNull(),
      verified: boolean("verified").default(false).notNull(),
      used: boolean("used").default(false).notNull(),
      expiresAt: timestamp("expires_at").notNull(),
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    emailVerificationCodes = pgTable("email_verification_codes", {
      id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
      email: varchar("email", { length: 255 }).notNull(),
      code: varchar("code", { length: 6 }).notNull(),
      verified: boolean("verified").default(false).notNull(),
      used: boolean("used").default(false).notNull(),
      expiresAt: timestamp("expires_at").notNull(),
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    userEmails = pgTable("user_emails", {
      id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
      userId: varchar("user_id", { length: 36 }).notNull(),
      email: varchar("email", { length: 255 }).notNull(),
      isPrimary: boolean("is_primary").default(false).notNull(),
      isVerified: boolean("is_verified").default(false).notNull(),
      verifiedAt: timestamp("verified_at"),
      createdAt: timestamp("created_at").defaultNow().notNull()
    }, (table) => [
      uniqueIndex("idx_user_emails_email_unique").on(table.email),
      index("idx_user_emails_user_id").on(table.userId)
    ]);
    passwordResetCodes = pgTable("password_reset_codes", {
      id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
      userId: varchar("user_id", { length: 36 }).notNull(),
      email: varchar("email", { length: 255 }).notNull(),
      code: varchar("code", { length: 6 }).notNull(),
      used: boolean("used").default(false).notNull(),
      expiresAt: timestamp("expires_at").notNull(),
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    chats = pgTable("chats", {
      id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
      type: varchar("type", { length: 10 }).notNull().default("p2p"),
      name: varchar("name", { length: 255 }),
      createdBy: varchar("created_by", { length: 36 }).notNull(),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    chatParticipants = pgTable("chat_participants", {
      id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
      chatId: varchar("chat_id", { length: 36 }).notNull(),
      userId: varchar("user_id", { length: 36 }).notNull(),
      role: varchar("role", { length: 20 }).notNull().default("member"),
      joinedAt: timestamp("joined_at").defaultNow().notNull(),
      lastReadAt: timestamp("last_read_at")
    }, (table) => [
      uniqueIndex("idx_chat_participant_unique").on(table.chatId, table.userId),
      index("idx_chat_participants_user").on(table.userId),
      index("idx_chat_participants_chat").on(table.chatId)
    ]);
    userBlocks = pgTable("user_blocks", {
      id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
      blockerId: varchar("blocker_id", { length: 36 }).notNull(),
      blockedUserId: varchar("blocked_user_id", { length: 36 }).notNull(),
      createdAt: timestamp("created_at").defaultNow().notNull()
    }, (table) => [
      uniqueIndex("idx_user_blocks_pair").on(table.blockerId, table.blockedUserId),
      index("idx_user_blocks_blocker").on(table.blockerId)
    ]);
    contentReports = pgTable("content_reports", {
      id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
      reporterId: varchar("reporter_id", { length: 36 }).notNull(),
      reportedUserId: varchar("reported_user_id", { length: 36 }),
      messageId: varchar("message_id", { length: 36 }),
      chatId: varchar("chat_id", { length: 36 }),
      reportType: varchar("report_type", { length: 30 }).notNull(),
      reason: varchar("reason", { length: 50 }).notNull(),
      details: text("details"),
      status: varchar("status", { length: 20 }).default("open").notNull(),
      createdAt: timestamp("created_at").defaultNow().notNull()
    }, (table) => [
      index("idx_content_reports_status").on(table.status, table.createdAt),
      index("idx_content_reports_reporter").on(table.reporterId)
    ]);
    feedPosts = pgTable("feed_posts", {
      id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
      authorId: varchar("author_id", { length: 36 }).notNull(),
      content: text("content").notNull(),
      mediaUrl: text("media_url"),
      contentHash: varchar("content_hash", { length: 64 }).notNull(),
      expiresAt: timestamp("expires_at").notNull(),
      createdAt: timestamp("created_at").defaultNow().notNull()
    }, (table) => [
      index("idx_feed_posts_created").on(table.createdAt),
      index("idx_feed_posts_author").on(table.authorId),
      index("idx_feed_posts_author_hash").on(table.authorId, table.contentHash)
    ]);
    feedLikes = pgTable("feed_likes", {
      id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
      postId: varchar("post_id", { length: 36 }).notNull(),
      userId: varchar("user_id", { length: 36 }).notNull(),
      createdAt: timestamp("created_at").defaultNow().notNull()
    }, (table) => [
      uniqueIndex("idx_feed_likes_unique").on(table.postId, table.userId),
      index("idx_feed_likes_post").on(table.postId)
    ]);
    feedComments = pgTable("feed_comments", {
      id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
      postId: varchar("post_id", { length: 36 }).notNull(),
      authorId: varchar("author_id", { length: 36 }).notNull(),
      content: text("content").notNull(),
      createdAt: timestamp("created_at").defaultNow().notNull()
    }, (table) => [
      index("idx_feed_comments_post").on(table.postId)
    ]);
    feedShares = pgTable("feed_shares", {
      id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
      postId: varchar("post_id", { length: 36 }).notNull(),
      userId: varchar("user_id", { length: 36 }).notNull(),
      createdAt: timestamp("created_at").defaultNow().notNull()
    }, (table) => [
      uniqueIndex("idx_feed_shares_unique").on(table.postId, table.userId),
      index("idx_feed_shares_post").on(table.postId)
    ]);
    pushTokens = pgTable("push_tokens", {
      id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
      userId: varchar("user_id", { length: 36 }).notNull(),
      expoPushToken: text("expo_push_token").notNull(),
      platform: varchar("platform", { length: 20 }),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (table) => [
      uniqueIndex("idx_push_tokens_token").on(table.expoPushToken),
      index("idx_push_tokens_user").on(table.userId)
    ]);
    chatMessages = pgTable("chat_messages", {
      id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
      chatId: varchar("chat_id", { length: 36 }).notNull(),
      senderId: varchar("sender_id", { length: 36 }).notNull(),
      content: text("content"),
      type: varchar("type", { length: 20 }).notNull().default("text"),
      status: varchar("status", { length: 20 }).notNull().default("sent"),
      imageUri: text("image_uri"),
      fileUri: text("file_uri"),
      fileName: varchar("file_name", { length: 255 }),
      fileSize: integer("file_size"),
      audioUri: text("audio_uri"),
      audioDuration: integer("audio_duration"),
      waveformData: text("waveform_data"),
      latitude: text("latitude"),
      longitude: text("longitude"),
      locationName: varchar("location_name", { length: 255 }),
      pollQuestion: varchar("poll_question", { length: 500 }),
      pollOptions: text("poll_options"),
      sharedContactName: varchar("shared_contact_name", { length: 255 }),
      sharedContactPhone: varchar("shared_contact_phone", { length: 50 }),
      editedAt: timestamp("edited_at"),
      isDeleted: boolean("is_deleted").default(false).notNull(),
      createdAt: timestamp("created_at").defaultNow().notNull()
    }, (table) => [
      index("idx_chat_messages_chat").on(table.chatId),
      index("idx_chat_messages_chat_created").on(table.chatId, table.createdAt),
      index("idx_chat_messages_sender").on(table.senderId)
    ]);
    passwordSchema = z.string().min(8, "Password must be at least 8 characters").regex(/[A-Z]/, "Password must contain at least one uppercase letter").regex(/[0-9]/, "Password must contain at least one number").regex(/[^A-Za-z0-9]/, "Password must contain at least one special character");
    registerSchema = z.object({
      phone: z.string().min(6, "Phone number is required").max(20),
      email: z.string().email("Invalid email address"),
      username: z.string().min(3, "Username must be at least 3 characters").max(50).regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores"),
      firstName: z.string().min(1, "First name is required").max(100),
      lastName: z.string().min(1, "Last name is required").max(100),
      password: passwordSchema
    });
    loginSchema = z.object({
      identifier: z.string().min(1, "Email or phone number is required"),
      password: z.string().min(1, "Password is required")
    });
    updateProfileSchema = z.object({
      firstName: z.string().min(1).max(100).optional(),
      lastName: z.string().min(1).max(100).optional(),
      username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_]+$/, "Letters, numbers, and underscores only").optional(),
      bio: z.string().max(500).nullable().optional(),
      businessName: z.string().max(255).nullable().optional(),
      tradingName: z.string().max(255).nullable().optional(),
      businessCategory: z.string().max(100).nullable().optional(),
      businessWebsite: z.string().max(500).nullable().optional(),
      businessLogoUrl: z.string().nullable().optional(),
      businessProvince: z.string().max(100).nullable().optional(),
      businessCountry: z.string().max(100).nullable().optional(),
      isVerifiedLekkerpreneur: z.boolean().optional(),
      lekkerNetworkId: z.string().max(100).nullable().optional(),
      lekkerWorkspaceId: z.string().max(100).nullable().optional(),
      status: z.string().max(200).nullable().optional(),
      presence: z.enum(["online", "away", "dnd", "offline"]).optional(),
      avatarColor: z.string().max(10).nullable().optional(),
      profilePhoto: z.string().nullable().optional(),
      autoReplyEnabled: z.boolean().optional(),
      autoReplyMessage: z.string().max(500).nullable().optional(),
      notificationsEnabled: z.boolean().optional(),
      locationEnabled: z.boolean().optional(),
      lastLatitude: z.string().nullable().optional(),
      lastLongitude: z.string().nullable().optional(),
      locationCity: z.string().max(100).nullable().optional(),
      locationRegion: z.string().max(100).nullable().optional()
    });
    insertUserSchema = createInsertSchema(users).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
  }
});

// server/storage.ts
var storage_exports = {};
__export(storage_exports, {
  db: () => db,
  storage: () => storage
});
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, or, and, ne, sql as sql2, asc, desc, count, inArray, gt, lt } from "drizzle-orm";
var pool, db, PgStorage, storage;
var init_storage = __esm({
  "server/storage.ts"() {
    "use strict";
    init_schema();
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required");
    }
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 3e4,
      connectionTimeoutMillis: 1e4
    });
    pool.on("error", (err) => {
      console.error("[DB Pool] Unexpected client error (connection will be recycled):", err.message);
    });
    db = drizzle(pool);
    PgStorage = class {
      async getUser(id) {
        const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
        return user;
      }
      async getUserByEmail(email) {
        const normalized = email.toLowerCase();
        const [emailRecord] = await db.select().from(userEmails).where(eq(userEmails.email, normalized)).limit(1);
        if (emailRecord) return this.getUser(emailRecord.userId);
        const [user] = await db.select().from(users).where(eq(users.email, normalized)).limit(1);
        return user;
      }
      async getUserByPhone(phone) {
        const [user] = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
        return user;
      }
      async getUserByUsername(username) {
        const [user] = await db.select().from(users).where(eq(users.username, username.toLowerCase())).limit(1);
        return user;
      }
      async getUserByLekkerNetworkId(lekkerNetworkId) {
        const [user] = await db.select().from(users).where(eq(users.lekkerNetworkId, lekkerNetworkId)).limit(1);
        return user;
      }
      async getUserByIdentifier(identifier) {
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
      async createUser(insertUser) {
        const [user] = await db.insert(users).values({
          ...insertUser,
          email: insertUser.email.toLowerCase(),
          username: insertUser.username.toLowerCase()
        }).returning();
        return user;
      }
      async updateUser(id, data) {
        const updateData = { ...data, updatedAt: /* @__PURE__ */ new Date() };
        const [user] = await db.update(users).set(updateData).where(eq(users.id, id)).returning();
        return user;
      }
      async getVerifiedUsers(excludeId, page, limit) {
        const whereClause = and(
          eq(users.isVerifiedLekkerpreneur, true),
          ne(users.id, excludeId)
        );
        const [totalResult] = await db.select({ value: count() }).from(users).where(whereClause);
        const total = totalResult?.value || 0;
        const offset = (page - 1) * limit;
        const results = await db.select().from(users).where(whereClause).orderBy(desc(users.lekkerVerifiedAt), asc(users.businessName)).limit(limit).offset(offset);
        return { users: results, total };
      }
      async getUserEmails(userId) {
        return db.select().from(userEmails).where(eq(userEmails.userId, userId)).orderBy(userEmails.createdAt);
      }
      async addUserEmail(userId, email, isPrimary, isVerified) {
        const [record] = await db.insert(userEmails).values({
          userId,
          email: email.toLowerCase(),
          isPrimary,
          isVerified,
          verifiedAt: isVerified ? /* @__PURE__ */ new Date() : null
        }).returning();
        return record;
      }
      async removeUserEmail(emailId, userId) {
        const [record] = await db.select().from(userEmails).where(
          and(eq(userEmails.id, emailId), eq(userEmails.userId, userId))
        ).limit(1);
        if (!record) return false;
        if (record.isPrimary) return false;
        await db.delete(userEmails).where(and(eq(userEmails.id, emailId), eq(userEmails.userId, userId)));
        return true;
      }
      async verifyUserEmail(emailId, userId) {
        await db.update(userEmails).set({ isVerified: true, verifiedAt: /* @__PURE__ */ new Date() }).where(and(eq(userEmails.id, emailId), eq(userEmails.userId, userId)));
        await db.update(users).set({ emailVerified: true, updatedAt: /* @__PURE__ */ new Date() }).where(eq(users.id, userId));
      }
      async emailExistsAnywhere(email) {
        const normalized = email.toLowerCase();
        const [record] = await db.select({ id: userEmails.id }).from(userEmails).where(eq(userEmails.email, normalized)).limit(1);
        if (record) return true;
        const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, normalized)).limit(1);
        return !!user;
      }
      async logAuthEvent(event, userId, ipAddress, userAgent, details) {
        await db.insert(authAuditLogs).values({
          userId: userId || null,
          event,
          ipAddress: ipAddress || null,
          userAgent: userAgent || null,
          details: details || null
        });
      }
      async createChat(type, createdBy, name) {
        const [chat] = await db.insert(chats).values({
          type,
          createdBy,
          name: name || null
        }).returning();
        return chat;
      }
      async addChatParticipant(chatId, userId, role = "member") {
        const [participant] = await db.insert(chatParticipants).values({
          chatId,
          userId,
          role
        }).returning();
        return participant;
      }
      async removeChatParticipant(chatId, userId) {
        await db.delete(chatParticipants).where(
          and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.userId, userId))
        );
      }
      async isUserInChat(chatId, userId) {
        const [p] = await db.select({ id: chatParticipants.id }).from(chatParticipants).where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.userId, userId))).limit(1);
        return !!p;
      }
      async findExistingP2PChat(userId1, userId2) {
        const result = await db.execute(sql2`
      SELECT c.* FROM chats c
      WHERE c.type = 'p2p'
        AND EXISTS (SELECT 1 FROM chat_participants cp1 WHERE cp1.chat_id = c.id AND cp1.user_id = ${userId1})
        AND EXISTS (SELECT 1 FROM chat_participants cp2 WHERE cp2.chat_id = c.id AND cp2.user_id = ${userId2})
      LIMIT 1
    `);
        if (result.rows && result.rows.length > 0) {
          const row = result.rows[0];
          return {
            id: row.id,
            type: row.type,
            name: row.name,
            createdBy: row.created_by,
            createdAt: new Date(row.created_at),
            updatedAt: new Date(row.updated_at)
          };
        }
        return void 0;
      }
      async getUserChats(userId) {
        const userParticipations = await db.select().from(chatParticipants).where(eq(chatParticipants.userId, userId));
        if (userParticipations.length === 0) return [];
        const chatIds = userParticipations.map((p) => p.chatId);
        const chatRows = await db.select().from(chats).where(inArray(chats.id, chatIds));
        const allParticipants = await db.select({
          chatId: chatParticipants.chatId,
          userId: chatParticipants.userId,
          role: chatParticipants.role
        }).from(chatParticipants).where(inArray(chatParticipants.chatId, chatIds));
        const results = [];
        for (const chat of chatRows) {
          const chatParts = allParticipants.filter((p) => p.chatId === chat.id);
          const [lastMsg] = await db.select().from(chatMessages).where(eq(chatMessages.chatId, chat.id)).orderBy(desc(chatMessages.createdAt)).limit(1);
          const myParticipation = userParticipations.find((p) => p.chatId === chat.id);
          let unreadCount = 0;
          if (myParticipation) {
            const unreadWhere = myParticipation.lastReadAt ? and(
              eq(chatMessages.chatId, chat.id),
              ne(chatMessages.senderId, userId),
              gt(chatMessages.createdAt, myParticipation.lastReadAt)
            ) : and(
              eq(chatMessages.chatId, chat.id),
              ne(chatMessages.senderId, userId)
            );
            const [unreadResult] = await db.select({ value: count() }).from(chatMessages).where(unreadWhere);
            unreadCount = unreadResult?.value || 0;
          }
          results.push({
            ...chat,
            participants: chatParts,
            lastMessage: lastMsg || void 0,
            unreadCount
          });
        }
        results.sort((a, b) => {
          const aTime = a.lastMessage?.createdAt?.getTime() || a.createdAt.getTime();
          const bTime = b.lastMessage?.createdAt?.getTime() || b.createdAt.getTime();
          return bTime - aTime;
        });
        return results;
      }
      async getChatMessages(chatId, limit = 50, before) {
        let whereClause;
        if (before) {
          const [refMsg] = await db.select({ createdAt: chatMessages.createdAt }).from(chatMessages).where(eq(chatMessages.id, before)).limit(1);
          if (refMsg) {
            whereClause = and(eq(chatMessages.chatId, chatId), lt(chatMessages.createdAt, refMsg.createdAt));
          } else {
            whereClause = eq(chatMessages.chatId, chatId);
          }
        } else {
          whereClause = eq(chatMessages.chatId, chatId);
        }
        const messages = await db.select().from(chatMessages).where(whereClause).orderBy(desc(chatMessages.createdAt)).limit(limit);
        return messages.reverse();
      }
      async sendMessage(chatId, senderId, content, type = "text", extras) {
        const values = {
          chatId,
          senderId,
          content,
          type,
          status: "sent"
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
        await db.update(chats).set({ updatedAt: /* @__PURE__ */ new Date() }).where(eq(chats.id, chatId));
        return message;
      }
      async markMessagesRead(chatId, userId) {
        await db.update(chatMessages).set({ status: "seen" }).where(
          and(
            eq(chatMessages.chatId, chatId),
            ne(chatMessages.senderId, userId),
            ne(chatMessages.status, "seen")
          )
        );
        await db.update(chatParticipants).set({ lastReadAt: /* @__PURE__ */ new Date() }).where(
          and(
            eq(chatParticipants.chatId, chatId),
            eq(chatParticipants.userId, userId)
          )
        );
      }
      async updateMessageStatus(messageId, status) {
        const [msg] = await db.update(chatMessages).set({ status }).where(eq(chatMessages.id, messageId)).returning();
        return msg;
      }
      async getChatParticipants(chatId) {
        const parts = await db.select().from(chatParticipants).where(eq(chatParticipants.chatId, chatId));
        const userIds = parts.map((p) => p.userId);
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
          presence: users.presence
        }).from(users).where(inArray(users.id, userIds));
        return parts.map((p) => ({
          ...p,
          user: usersData.find((u) => u.id === p.userId)
        }));
      }
      async getChat(chatId) {
        const [chat] = await db.select().from(chats).where(eq(chats.id, chatId)).limit(1);
        return chat;
      }
      async deleteChat(chatId) {
        await db.delete(chatMessages).where(eq(chatMessages.chatId, chatId));
        await db.delete(chatParticipants).where(eq(chatParticipants.chatId, chatId));
        await db.delete(chats).where(eq(chats.id, chatId));
      }
      async blockUser(blockerId, blockedUserId) {
        if (blockerId === blockedUserId) return;
        await db.insert(userBlocks).values({ blockerId, blockedUserId }).onConflictDoNothing();
      }
      async unblockUser(blockerId, blockedUserId) {
        await db.delete(userBlocks).where(
          and(eq(userBlocks.blockerId, blockerId), eq(userBlocks.blockedUserId, blockedUserId))
        );
      }
      async getBlockedUsers(blockerId) {
        const rows = await db.select({
          id: userBlocks.id,
          blockedUserId: userBlocks.blockedUserId,
          createdAt: userBlocks.createdAt,
          firstName: users.firstName,
          lastName: users.lastName,
          username: users.username
        }).from(userBlocks).innerJoin(users, eq(users.id, userBlocks.blockedUserId)).where(eq(userBlocks.blockerId, blockerId)).orderBy(desc(userBlocks.createdAt));
        return rows.map((r) => ({
          id: r.id,
          blockedUserId: r.blockedUserId,
          name: `${r.firstName} ${r.lastName}`.trim() || r.username,
          createdAt: r.createdAt
        }));
      }
      async isEitherUserBlocked(userId1, userId2) {
        const [row] = await db.select({ id: userBlocks.id }).from(userBlocks).where(
          or(
            and(eq(userBlocks.blockerId, userId1), eq(userBlocks.blockedUserId, userId2)),
            and(eq(userBlocks.blockerId, userId2), eq(userBlocks.blockedUserId, userId1))
          )
        ).limit(1);
        return !!row;
      }
      async createContentReport(input) {
        const [row] = await db.insert(contentReports).values({
          reporterId: input.reporterId,
          reportedUserId: input.reportedUserId ?? null,
          messageId: input.messageId ?? null,
          chatId: input.chatId ?? null,
          reportType: input.reportType,
          reason: input.reason,
          details: input.details ?? null,
          status: "open"
        }).returning({ id: contentReports.id });
        return { id: row.id };
      }
      async deleteUserAccount(userId) {
        const userChats = await db.select({ chatId: chatParticipants.chatId }).from(chatParticipants).where(eq(chatParticipants.userId, userId));
        for (const { chatId } of userChats) {
          const participants = await db.select().from(chatParticipants).where(eq(chatParticipants.chatId, chatId));
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
          or(eq(userBlocks.blockerId, userId), eq(userBlocks.blockedUserId, userId))
        );
        await db.delete(contentReports).where(
          or(eq(contentReports.reporterId, userId), eq(contentReports.reportedUserId, userId))
        );
        await db.delete(pushTokens).where(eq(pushTokens.userId, userId));
        await db.delete(userEmails).where(eq(userEmails.userId, userId));
        const authoredPosts = await db.select({ id: feedPosts.id }).from(feedPosts).where(eq(feedPosts.authorId, userId));
        const postIds = authoredPosts.map((p) => p.id);
        if (postIds.length > 0) {
          await db.delete(feedComments).where(inArray(feedComments.postId, postIds));
          await db.delete(feedLikes).where(inArray(feedLikes.postId, postIds));
          await db.delete(feedShares).where(inArray(feedShares.postId, postIds));
          await db.delete(feedPosts).where(eq(feedPosts.authorId, userId));
        }
        await db.delete(feedComments).where(eq(feedComments.authorId, userId));
        await db.delete(feedLikes).where(eq(feedLikes.userId, userId));
        await db.delete(feedShares).where(eq(feedShares.userId, userId));
        await db.delete(authAuditLogs).where(eq(authAuditLogs.userId, userId));
        await db.delete(users).where(eq(users.id, userId));
      }
    };
    storage = new PgStorage();
  }
});

// server/index.ts
import express from "express";
import compression from "compression";

// server/routes.ts
init_schema();
init_storage();
import { createServer } from "node:http";
import OpenAI from "openai";
import rateLimit from "express-rate-limit";
import { sql as sql4, or as or3, and as and4, ne as ne2, eq as eq4 } from "drizzle-orm";

// server/auth.ts
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
var JWT_SECRET = process.env.SESSION_SECRET;
if (!JWT_SECRET) {
  throw new Error("SESSION_SECRET environment variable is required for JWT signing");
}
var TOKEN_EXPIRY = "7d";
var BCRYPT_ROUNDS = 12;
async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}
async function verifyPassword(password, hash) {
  if (!hash) return false;
  return bcrypt.compare(password, hash);
}
function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Authentication required" });
  }
  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
  req.user = payload;
  next();
}

// server/objectStorage.ts
import { Storage } from "@google-cloud/storage";
import { randomUUID } from "crypto";

// server/objectAcl.ts
var ACL_POLICY_METADATA_KEY = "custom:aclPolicy";
async function setObjectAclPolicy(objectFile, aclPolicy) {
  const [exists] = await objectFile.exists();
  if (!exists) {
    throw new Error(`Object not found: ${objectFile.name}`);
  }
  await objectFile.setMetadata({
    metadata: {
      [ACL_POLICY_METADATA_KEY]: JSON.stringify(aclPolicy)
    }
  });
}
async function getObjectAclPolicy(objectFile) {
  const [metadata] = await objectFile.getMetadata();
  const aclPolicy = metadata?.metadata?.[ACL_POLICY_METADATA_KEY];
  if (!aclPolicy) {
    return null;
  }
  return JSON.parse(aclPolicy);
}
async function canAccessObject({
  userId,
  objectFile,
  requestedPermission
}) {
  const aclPolicy = await getObjectAclPolicy(objectFile);
  if (!aclPolicy) {
    return false;
  }
  if (aclPolicy.visibility === "public" && requestedPermission === "read" /* READ */) {
    return true;
  }
  if (!userId) {
    return false;
  }
  if (aclPolicy.owner === userId) {
    return true;
  }
  return false;
}

// server/objectStorage.ts
var REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
var objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token"
      }
    },
    universe_domain: "googleapis.com"
  },
  projectId: ""
});
var ObjectNotFoundError = class _ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, _ObjectNotFoundError.prototype);
  }
};
var ObjectStorageService = class {
  constructor() {
  }
  getPublicObjectSearchPaths() {
    const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
    const paths = Array.from(
      new Set(
        pathsStr.split(",").map((path2) => path2.trim()).filter((path2) => path2.length > 0)
      )
    );
    if (paths.length === 0) {
      throw new Error(
        "PUBLIC_OBJECT_SEARCH_PATHS not set. Create a bucket in 'Object Storage' tool and set PUBLIC_OBJECT_SEARCH_PATHS env var (comma-separated paths)."
      );
    }
    return paths;
  }
  getPrivateObjectDir() {
    const dir = process.env.PRIVATE_OBJECT_DIR || "";
    if (!dir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' tool and set PRIVATE_OBJECT_DIR env var."
      );
    }
    return dir;
  }
  async searchPublicObject(filePath) {
    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const fullPath = `${searchPath}/${filePath}`;
      const { bucketName, objectName } = parseObjectPath(fullPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      const [exists] = await file.exists();
      if (exists) {
        return file;
      }
    }
    return null;
  }
  async downloadObject(file, res, cacheTtlSec = 3600) {
    try {
      const [metadata] = await file.getMetadata();
      const aclPolicy = await getObjectAclPolicy(file);
      const isPublic = aclPolicy?.visibility === "public";
      res.set({
        "Content-Type": metadata.contentType || "application/octet-stream",
        "Content-Length": metadata.size,
        "Cache-Control": `${isPublic ? "public" : "private"}, max-age=${cacheTtlSec}`
      });
      const stream = file.createReadStream();
      stream.on("error", (err) => {
        console.error("Stream error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Error streaming file" });
        }
      });
      stream.pipe(res);
    } catch (error) {
      console.error("Error downloading file:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error downloading file" });
      }
    }
  }
  async getObjectEntityUploadURL() {
    const privateObjectDir = this.getPrivateObjectDir();
    const objectId = randomUUID();
    const fullPath = `${privateObjectDir}/uploads/${objectId}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);
    return signObjectURL({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec: 900
    });
  }
  async getObjectEntityFile(objectPath) {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }
    const parts = objectPath.slice(1).split("/");
    if (parts.length < 2) {
      throw new ObjectNotFoundError();
    }
    const entityId = parts.slice(1).join("/");
    let entityDir = this.getPrivateObjectDir();
    if (!entityDir.endsWith("/")) {
      entityDir = `${entityDir}/`;
    }
    const objectEntityPath = `${entityDir}${entityId}`;
    const { bucketName, objectName } = parseObjectPath(objectEntityPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const objectFile = bucket.file(objectName);
    const [exists] = await objectFile.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    return objectFile;
  }
  normalizeObjectEntityPath(rawPath) {
    if (!rawPath.startsWith("https://storage.googleapis.com/")) {
      return rawPath;
    }
    const url = new URL(rawPath);
    const rawObjectPath = url.pathname;
    let objectEntityDir = this.getPrivateObjectDir();
    if (!objectEntityDir.endsWith("/")) {
      objectEntityDir = `${objectEntityDir}/`;
    }
    if (!rawObjectPath.startsWith(objectEntityDir)) {
      return rawObjectPath;
    }
    const entityId = rawObjectPath.slice(objectEntityDir.length);
    return `/objects/${entityId}`;
  }
  async trySetObjectEntityAclPolicy(rawPath, aclPolicy) {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith("/")) {
      return normalizedPath;
    }
    const objectFile = await this.getObjectEntityFile(normalizedPath);
    await setObjectAclPolicy(objectFile, aclPolicy);
    return normalizedPath;
  }
  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission
  }) {
    return canAccessObject({
      userId,
      objectFile,
      requestedPermission: requestedPermission ?? "read" /* READ */
    });
  }
};
function parseObjectPath(path2) {
  if (!path2.startsWith("/")) {
    path2 = `/${path2}`;
  }
  const pathParts = path2.split("/");
  if (pathParts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }
  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join("/");
  return { bucketName, objectName };
}
async function signObjectURL({
  bucketName,
  objectName,
  method,
  ttlSec
}) {
  const request = {
    bucket_name: bucketName,
    object_name: objectName,
    method,
    expires_at: new Date(Date.now() + ttlSec * 1e3).toISOString()
  };
  const response = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request)
    }
  );
  if (!response.ok) {
    throw new Error(
      `Failed to sign object URL, errorcode: ${response.status}, make sure you're running on Replit`
    );
  }
  const { signed_url: signedURL } = await response.json();
  return signedURL;
}

// server/lekkerNetwork.ts
var LEKKER_API_BASE = process.env.LEKKER_API_BASE_URL || (process.env.NODE_ENV === "production" ? "https://lekker.network" : "https://ba8f68e4-7053-4a89-92cd-ae1a588f2a0c-00-2ocng4z2k42dj.spock.replit.dev");
var LEKKER_API_URL = `${LEKKER_API_BASE}/api/v1/lekkerpreneurs`;
var LEKKER_SYNC_URL = `${LEKKER_API_BASE}/api/auth/sync-lekker`;
var LEKKER_WORKSPACES_URL = `${LEKKER_API_BASE}/api/v1/workspaces`;
var LEKKER_API_KEY = process.env.LEKKER_NETWORK_API_KEY || "";
function normalizePhone(phone) {
  const digits = phone.replace(/[^\d+]/g, "");
  if (digits.startsWith("0") && digits.length === 10) {
    return "+27" + digits.substring(1);
  }
  if (!digits.startsWith("+") && digits.length >= 9) {
    return "+" + digits;
  }
  return digits;
}
async function apiFetch(url, options) {
  if (!LEKKER_API_KEY) {
    console.warn("LEKKER_NETWORK_API_KEY not set, skipping Lekker Network API call");
    return null;
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15e3);
    const response = await fetch(url, {
      ...options,
      headers: {
        "X-API-Key": LEKKER_API_KEY,
        "Content-Type": "application/json",
        "Accept": "application/json",
        ...options?.headers || {}
      },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!response.ok) {
      console.error(`Lekker Network API error: ${response.status} ${response.statusText} \u2014 ${url}`);
      return null;
    }
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      console.warn(`Lekker Network API returned non-JSON: ${contentType}`);
      return null;
    }
    return await response.json();
  } catch (error) {
    if (error.name === "AbortError") {
      console.error(`Lekker Network API request timed out \u2014 ${url}`);
    } else {
      console.error(`Lekker Network API error: ${error.message}`);
    }
    return null;
  }
}
async function fetchFromApi(params) {
  const url = new URL(LEKKER_API_URL);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return apiFetch(url.toString());
}
async function syncWithLekkerNetwork(email, phone) {
  const body = {};
  if (email && email.includes("@")) {
    body.email = email.toLowerCase().trim();
  }
  if (phone) {
    body.phone = normalizePhone(phone);
  }
  return apiFetch(LEKKER_SYNC_URL, {
    method: "POST",
    body: JSON.stringify(body)
  });
}
async function findLekkerpreneurByPhoneOrEmail(phone, email) {
  const normalizedEmail = email?.toLowerCase().trim() || "";
  const normalizedPhone = normalizePhone(phone || "");
  const syncResult = await syncWithLekkerNetwork(normalizedEmail, normalizedPhone);
  if (syncResult?.matched && syncResult.user) {
    return syncResult.user;
  }
  const maxPages = 10;
  const pageSize = 100;
  for (let page = 1; page <= maxPages; page++) {
    const result = await fetchFromApi({ page: String(page), limit: String(pageSize) });
    if (!result?.data?.length) break;
    if (normalizedEmail && normalizedEmail.includes("@")) {
      const emailMatch = result.data.find(
        (entry) => entry.email?.toLowerCase().trim() === normalizedEmail
      );
      if (emailMatch) return emailMatch;
    }
    if (normalizedPhone) {
      const phoneMatch = result.data.find(
        (entry) => entry.phone && normalizePhone(entry.phone) === normalizedPhone
      );
      if (phoneMatch) return phoneMatch;
    }
    if (result.data.length < pageSize) break;
  }
  return null;
}
async function fetchDirectory(params) {
  const queryParams = {};
  if (params.page) queryParams.page = String(params.page);
  if (params.limit) queryParams.limit = String(params.limit);
  if (params.search) queryParams.search = params.search;
  if (params.location) queryParams.location = params.location;
  if (params.category) queryParams.category = params.category;
  if (params.sort) queryParams.sort = params.sort;
  return fetchFromApi(queryParams);
}
async function fetchLekkerpreneurById(id) {
  const result = await fetchFromApi({ search: id, limit: "20" });
  if (result?.data?.length) {
    const match = result.data.find((entry) => entry.id === id);
    if (match) return match;
  }
  return null;
}
async function fetchWorkspaceById(workspaceId) {
  const result = await apiFetch(`${LEKKER_WORKSPACES_URL}/${workspaceId}`);
  return result?.workspace || null;
}
function resolveWorkspace(entry) {
  const ws = entry.workspace || {};
  return {
    id: ws.id || void 0,
    name: ws.name || void 0,
    currency: ws.currency || "ZAR",
    shippingEnabled: ws.shippingEnabled ?? false,
    paymentUrl: ws.paymentUrl || null,
    websiteUrl: ws.websiteUrl || entry.website || null,
    businessName: ws.businessName || entry.businessName || null,
    tradingName: ws.tradingName || entry.tradingName || null,
    businessAddress: ws.businessAddress || null,
    businessPhone: ws.businessPhone || entry.phone || entry.businessPhone || null,
    businessEmail: ws.businessEmail || entry.email || entry.businessEmail || null,
    businessWebsite: ws.businessWebsite || entry.website || null,
    logoUrl: ws.logoUrl || entry.logoUrl || null,
    category: ws.category || entry.category || null,
    province: ws.province || entry.province || entry.location?.province || null,
    website: ws.website || entry.website || null,
    isVatVendor: ws.isVatVendor ?? false,
    defaultVatStatus: ws.defaultVatStatus || "no_vat",
    invoiceNumberPrefix: ws.invoiceNumberPrefix || "INV",
    quoteNumberPrefix: ws.quoteNumberPrefix || "QUO",
    financialYearEndMonth: ws.financialYearEndMonth ?? 2,
    isVerified: ws.isVerified ?? entry.isVerified ?? false
  };
}
function extractLekkerpreneurProfile(entry) {
  const ws = resolveWorkspace(entry);
  return {
    businessName: ws.businessName || entry.businessName,
    tradingName: ws.tradingName || entry.tradingName || null,
    lekkerNetworkId: entry.id,
    lekkerWorkspaceId: entry.workspaceId || entry.workspace?.id || null,
    isVerifiedLekkerpreneur: true,
    lekkerNetworkAccess: true,
    businessCategory: ws.category || entry.category || null,
    businessWebsite: ws.businessWebsite || ws.websiteUrl || entry.website || null,
    businessLogoUrl: ws.logoUrl || entry.logoUrl || null,
    businessProvince: ws.province || entry.province || entry.location?.province || null,
    businessCountry: entry.location?.country || "South Africa",
    lekkerVerifiedAt: /* @__PURE__ */ new Date()
  };
}
var LEKKER_MOBILE_BASE = process.env.LEKKER_API_BASE_URL || "https://lekker.network";
async function lekkerMobileFetch(path2, init) {
  if (!LEKKER_API_KEY) return null;
  try {
    const res = await fetch(`${LEKKER_MOBILE_BASE}${path2}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": LEKKER_API_KEY,
        ...init?.headers || {}
      }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
async function fetchMobileSessionToken(lekkerNetworkUserId) {
  const data = await lekkerMobileFetch("/api/v1/mobile/session-token", {
    method: "POST",
    body: JSON.stringify({ userId: lekkerNetworkUserId })
  });
  return data?.token || null;
}
async function fetchWorkspaceEmailStatus(workspaceId) {
  const data = await lekkerMobileFetch(
    `/api/v1/mobile/email/status?workspaceId=${encodeURIComponent(workspaceId)}`
  );
  return data || { active: false };
}
async function fetchMobileEmailThreads(workspaceId, page = 1) {
  return lekkerMobileFetch(
    `/api/v1/mobile/email/threads?workspaceId=${encodeURIComponent(workspaceId)}&page=${page}`
  );
}
async function fetchMobileEmailThread(workspaceId, threadId) {
  return lekkerMobileFetch(
    `/api/v1/mobile/email/threads/${threadId}?workspaceId=${encodeURIComponent(workspaceId)}`
  );
}
async function sendMobileEmail(workspaceId, userId, payload) {
  const to = Array.isArray(payload.to) ? payload.to : [payload.to];
  return lekkerMobileFetch("/api/v1/mobile/email/send", {
    method: "POST",
    body: JSON.stringify({
      workspaceId,
      userId,
      to,
      subject: payload.subject,
      bodyText: payload.bodyText,
      inReplyTo: payload.inReplyTo,
      references: payload.references
    })
  });
}
function buildSyncUserResponse(entry) {
  const ws = resolveWorkspace(entry);
  return {
    id: entry.id,
    workspaceId: entry.workspaceId || null,
    name: entry.ownerName || entry.name || entry.businessName || "Unknown",
    email: entry.email || "",
    emailVerified: entry.emailVerified ?? false,
    memberSince: entry.memberSince || entry.createdAt || "",
    workspace: ws
  };
}
function buildDirectoryEntry(d) {
  const ws = resolveWorkspace(d);
  return {
    id: d.id,
    workspaceId: d.workspaceId || null,
    name: d.ownerName || d.businessName || "Unknown",
    businessName: d.businessName || d.ownerName || "Unknown Business",
    tradingName: ws.tradingName || "",
    serviceType: d.directoryCategory || ws.category || "General",
    location: ws.province || d.location?.province || "South Africa",
    province: ws.province || d.location?.province || "",
    phone: ws.businessPhone || d.phone || "",
    email: ws.businessEmail || d.email || "",
    bio: d.servicesOffered || "",
    avatarColor: "#F5B800",
    website: ws.businessWebsite || ws.websiteUrl || d.website || "",
    logoUrl: ws.logoUrl || d.logoUrl || "",
    isVerified: ws.isVerified ?? d.isVerified ?? false,
    emailVerified: d.emailVerified ?? false,
    memberSince: d.memberSince || d.createdAt || "",
    workspace: ws
  };
}

// server/gmail.ts
import { google } from "googleapis";
var connectionSettings;
async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY ? "repl " + process.env.REPL_IDENTITY : process.env.WEB_REPL_RENEWAL ? "depl " + process.env.WEB_REPL_RENEWAL : null;
  if (!xReplitToken) {
    throw new Error("X-Replit-Token not found for repl/depl");
  }
  connectionSettings = await fetch(
    "https://" + hostname + "/api/v2/connection?include_secrets=true&connector_names=google-mail",
    {
      headers: {
        "Accept": "application/json",
        "X-Replit-Token": xReplitToken
      }
    }
  ).then((res) => res.json()).then((data) => data.items?.[0]);
  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;
  if (!connectionSettings || !accessToken) {
    throw new Error("Gmail not connected");
  }
  return accessToken;
}
async function getUncachableGmailClient() {
  const accessToken = await getAccessToken();
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.gmail({ version: "v1", auth: oauth2Client });
}
async function sendEmailVerificationEmail(toEmail, code, firstName) {
  try {
    const gmail = await getUncachableGmailClient();
    const subject = `${code} is your Lekker Chat email verification code`;
    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#1A1A1A;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#1A1A1A;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#252525;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="background-color:#F5B800;padding:32px 24px;text-align:center;">
              <h1 style="margin:0;color:#1A1A1A;font-size:24px;font-weight:700;">Lekker Chat</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 24px;">
              <p style="margin:0 0 16px;color:#FFFFFF;font-size:16px;">Hi ${firstName},</p>
              <p style="margin:0 0 24px;color:#B0B0B0;font-size:14px;line-height:22px;">
                Welcome to Lekker Chat! Use the code below to verify your email address. This code expires in 10 minutes.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:16px 0;">
                    <div style="background-color:#1A1A1A;border:2px solid #F5B800;border-radius:12px;padding:20px 32px;display:inline-block;">
                      <span style="font-size:36px;font-weight:700;color:#F5B800;letter-spacing:12px;font-family:monospace;">${code}</span>
                    </div>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;color:#B0B0B0;font-size:13px;line-height:20px;">
                If you didn't create a Lekker Chat account, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px 24px;border-top:1px solid #333333;text-align:center;">
              <p style="margin:0;color:#666666;font-size:12px;">
                Powered by <a href="https://lekker.network" style="color:#F5B800;text-decoration:none;">Lekker Network</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
    const rawMessage = [
      `To: ${toEmail}`,
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/html; charset=utf-8`,
      ``,
      htmlBody
    ].join("\r\n");
    const encodedMessage = Buffer.from(rawMessage).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: encodedMessage }
    });
    console.log(`[Gmail] Email verification sent to ${toEmail}`);
    return true;
  } catch (error) {
    console.error("[Gmail] Failed to send email verification:", error);
    return false;
  }
}
async function sendPasswordResetEmail(toEmail, code, firstName) {
  try {
    const gmail = await getUncachableGmailClient();
    const subject = `${code} is your Lekker Chat password reset code`;
    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#1A1A1A;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#1A1A1A;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#252525;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="background-color:#F5B800;padding:32px 24px;text-align:center;">
              <h1 style="margin:0;color:#1A1A1A;font-size:24px;font-weight:700;">Lekker Chat</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 24px;">
              <p style="margin:0 0 16px;color:#FFFFFF;font-size:16px;">Hi ${firstName},</p>
              <p style="margin:0 0 24px;color:#B0B0B0;font-size:14px;line-height:22px;">
                You requested to reset your password. Use the code below to continue. This code expires in 15 minutes.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:16px 0;">
                    <div style="background-color:#1A1A1A;border:2px solid #F5B800;border-radius:12px;padding:20px 32px;display:inline-block;">
                      <span style="font-size:36px;font-weight:700;color:#F5B800;letter-spacing:12px;font-family:monospace;">${code}</span>
                    </div>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;color:#B0B0B0;font-size:13px;line-height:20px;">
                If you didn't request this, you can safely ignore this email. Your password won't be changed.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px 24px;border-top:1px solid #333333;text-align:center;">
              <p style="margin:0;color:#666666;font-size:12px;">
                Powered by <a href="https://lekker.network" style="color:#F5B800;text-decoration:none;">Lekker Network</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
    const rawMessage = [
      `To: ${toEmail}`,
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/html; charset=utf-8`,
      ``,
      htmlBody
    ].join("\r\n");
    const encodedMessage = Buffer.from(rawMessage).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: encodedMessage
      }
    });
    console.log(`[Gmail] Password reset email sent to ${toEmail}`);
    return true;
  } catch (error) {
    console.error("[Gmail] Failed to send password reset email:", error);
    return false;
  }
}

// server/twilio.ts
import Twilio from "twilio";
var accountSid = process.env.TWILIO_ACCOUNT_SID;
var authToken = process.env.TWILIO_AUTH_TOKEN;
var fromNumber = process.env.TWILIO_PHONE_NUMBER;
async function sendPhoneVerificationSMS(toPhone, code) {
  if (!accountSid || !authToken || !fromNumber) {
    console.error("[Twilio] Missing Twilio credentials");
    throw new Error("SMS service not configured");
  }
  const client = Twilio(accountSid, authToken);
  await client.messages.create({
    body: `Lekker Chat: Your verification code is ${code}. It expires in 10 minutes. Do not share this code with anyone.`,
    from: fromNumber,
    to: toPhone
  });
  console.log(`[Twilio] Phone verification SMS sent to ${toPhone}`);
  return true;
}
async function sendPasswordResetSMS(toPhone, code, firstName) {
  if (!accountSid || !authToken || !fromNumber) {
    console.error("[Twilio] Missing Twilio credentials");
    return false;
  }
  try {
    const client = Twilio(accountSid, authToken);
    await client.messages.create({
      body: `Lekker Chat: Hi ${firstName}, your password reset code is ${code}. It expires in 15 minutes. If you didn't request this, ignore this message.`,
      from: fromNumber,
      to: toPhone
    });
    console.log(`[Twilio] Password reset SMS sent to ${toPhone}`);
    return true;
  } catch (error) {
    console.error("[Twilio] Failed to send password reset SMS:", error);
    return false;
  }
}

// server/whatsapp-otp.ts
import Twilio2 from "twilio";

// shared/mobile-utils.ts
function normaliseMobile(raw) {
  if (!raw?.trim()) return null;
  const digits = raw.replace(/[\s\-().]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("0")) return "+27" + digits.slice(1);
  if (digits.startsWith("27") && digits.length >= 11) return "+" + digits;
  if (digits.length >= 9) return "+27" + digits;
  return digits.length >= 7 ? "+27" + digits : null;
}
function phoneToPlaceholderEmail(phone) {
  const digits = phone.replace(/\D/g, "");
  return `p${digits}@phone.lekker.chat`;
}
function phoneToUsername(phone) {
  const digits = phone.replace(/\D/g, "").slice(-12);
  return `u_${digits}`;
}

// server/whatsapp-otp.ts
function getConfig() {
  const accountSid2 = process.env.TWILIO_ACCOUNT_SID;
  const authToken2 = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM ?? process.env.TWILIO_BUSINESS_FROM;
  const isApiKey = accountSid2?.startsWith("SK");
  const mainAccountSid = isApiKey ? process.env.TWILIO_MAIN_ACCOUNT_SID : void 0;
  return { accountSid: accountSid2, authToken: authToken2, from, isApiKey, mainAccountSid };
}
async function sendWhatsAppOtp(to, code) {
  const e164 = normaliseMobile(to) ?? to;
  const { accountSid: accountSid2, authToken: authToken2, from, isApiKey, mainAccountSid } = getConfig();
  if (!accountSid2 || !authToken2 || !from) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[whatsapp-otp] DEV \u2014 code for ${e164}: ${code}`);
      return;
    }
    throw new Error("WHATSAPP_OTP_NOT_CONFIGURED");
  }
  const client = isApiKey && mainAccountSid ? Twilio2(accountSid2, authToken2, { accountSid: mainAccountSid }) : Twilio2(accountSid2, authToken2);
  const contentSid = process.env.TWILIO_CONTENT_SID;
  const toWa = e164.startsWith("whatsapp:") ? e164 : `whatsapp:${e164}`;
  const fromWa = from.startsWith("whatsapp:") ? from : `whatsapp:${from}`;
  if (contentSid) {
    await client.messages.create({
      from: fromWa,
      to: toWa,
      contentSid,
      contentVariables: JSON.stringify({ 1: code })
    });
  } else {
    await client.messages.create({
      from: fromWa,
      to: toWa,
      body: `Lekker Chat: Your verification code is ${code}. It expires in 10 minutes. Do not share this code.`
    });
  }
  console.log(`[whatsapp-otp] Sent to ${e164}`);
}

// server/apple-review-auth.ts
function getAppleReviewConfig() {
  const rawPhone = process.env.APPLE_REVIEW_PHONE?.trim();
  const code = process.env.APPLE_REVIEW_CODE?.trim();
  if (!rawPhone || !code) return null;
  const phone = normaliseMobile(rawPhone);
  if (!phone) return null;
  return {
    phone,
    code,
    displayName: process.env.APPLE_REVIEW_DISPLAY_NAME?.trim() || "Apple Reviewer"
  };
}
function isAppleReviewPhone(rawPhone) {
  const config = getAppleReviewConfig();
  if (!config) return false;
  const phone = normaliseMobile(rawPhone);
  return phone === config.phone;
}
function isAppleReviewLogin(rawPhone, submittedCode) {
  const config = getAppleReviewConfig();
  if (!config) return false;
  const phone = normaliseMobile(rawPhone);
  if (phone !== config.phone) return false;
  return String(submittedCode).trim() === config.code;
}

// server/feed.ts
init_storage();
init_schema();
import { createHash } from "crypto";
import { and as and2, desc as desc2, eq as eq2, gt as gt2, inArray as inArray2, or as or2, sql as sql3 } from "drizzle-orm";
function hashContent(content) {
  return createHash("sha256").update(content.toLowerCase().trim()).digest("hex").slice(0, 16);
}
async function hydratePosts(postRows) {
  if (postRows.length === 0) return [];
  const postIds = postRows.map((p) => p.id);
  const authorIds = [...new Set(postRows.map((p) => p.authorId))];
  const authors = await db.select({
    id: users.id,
    firstName: users.firstName,
    lastName: users.lastName,
    avatarColor: users.avatarColor,
    profilePhoto: users.profilePhoto
  }).from(users).where(inArray2(users.id, authorIds));
  const authorMap = new Map(authors.map((a) => [a.id, a]));
  const likes = await db.select().from(feedLikes).where(inArray2(feedLikes.postId, postIds));
  const comments = await db.select().from(feedComments).where(inArray2(feedComments.postId, postIds)).orderBy(feedComments.createdAt);
  const shares = await db.select().from(feedShares).where(inArray2(feedShares.postId, postIds));
  const commentAuthorIds = [...new Set(comments.map((c) => c.authorId))];
  const commentAuthors = commentAuthorIds.length ? await db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName }).from(users).where(inArray2(users.id, commentAuthorIds)) : [];
  const commentAuthorMap = new Map(
    commentAuthors.map((a) => [a.id, `${a.firstName} ${a.lastName}`.trim()])
  );
  const likesByPost = /* @__PURE__ */ new Map();
  for (const l of likes) {
    const arr = likesByPost.get(l.postId) || [];
    arr.push(l.userId);
    likesByPost.set(l.postId, arr);
  }
  const commentsByPost = /* @__PURE__ */ new Map();
  for (const c of comments) {
    const arr = commentsByPost.get(c.postId) || [];
    arr.push({
      id: c.id,
      authorId: c.authorId,
      authorName: commentAuthorMap.get(c.authorId) || "User",
      content: c.content,
      createdAt: c.createdAt.toISOString()
    });
    commentsByPost.set(c.postId, arr);
  }
  const sharesByPost = /* @__PURE__ */ new Map();
  for (const s of shares) {
    const arr = sharesByPost.get(s.postId) || [];
    arr.push(s.userId);
    sharesByPost.set(s.postId, arr);
  }
  return postRows.map((p) => {
    const author = authorMap.get(p.authorId);
    return {
      id: p.id,
      authorId: p.authorId,
      authorName: author ? `${author.firstName} ${author.lastName}`.trim() : "User",
      authorAvatarColor: author?.avatarColor || "#F5B800",
      authorProfilePhoto: author?.profilePhoto,
      content: p.content,
      mediaUrl: p.mediaUrl,
      createdAt: p.createdAt.toISOString(),
      likes: likesByPost.get(p.id) || [],
      comments: commentsByPost.get(p.id) || [],
      shares: sharesByPost.get(p.id) || [],
      contentHash: p.contentHash
    };
  });
}
async function listFeedPosts(opts) {
  const page = Math.max(1, opts.page || 1);
  const limit = Math.min(50, Math.max(1, opts.limit || 20));
  const offset = (page - 1) * limit;
  const now = /* @__PURE__ */ new Date();
  const visibility = or2(
    gt2(feedPosts.expiresAt, now),
    sql3`EXISTS (SELECT 1 FROM feed_shares WHERE feed_shares.post_id = ${feedPosts.id})`
  );
  const conditions = [visibility];
  if (opts.authorId) {
    conditions.push(eq2(feedPosts.authorId, opts.authorId));
  }
  const rows = await db.select().from(feedPosts).where(and2(...conditions)).orderBy(desc2(feedPosts.createdAt)).limit(limit).offset(offset);
  return hydratePosts(rows);
}
async function getFeedPostById(postId) {
  const [row] = await db.select().from(feedPosts).where(eq2(feedPosts.id, postId)).limit(1);
  if (!row) return null;
  const [dto] = await hydratePosts([row]);
  return dto || null;
}
async function createFeedPost(input) {
  const contentHash = hashContent(input.content);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1e3);
  const [dup] = await db.select({ id: feedPosts.id }).from(feedPosts).where(
    and2(
      eq2(feedPosts.authorId, input.authorId),
      eq2(feedPosts.contentHash, contentHash),
      gt2(feedPosts.createdAt, since)
    )
  ).limit(1);
  if (dup) return "duplicate";
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1e3);
  const [row] = await db.insert(feedPosts).values({
    authorId: input.authorId,
    content: input.content,
    mediaUrl: input.mediaUrl || null,
    contentHash,
    expiresAt
  }).returning();
  const [dto] = await hydratePosts([row]);
  return dto || null;
}
async function toggleFeedLike(postId, userId) {
  const [existing] = await db.select().from(feedLikes).where(and2(eq2(feedLikes.postId, postId), eq2(feedLikes.userId, userId))).limit(1);
  if (existing) {
    await db.delete(feedLikes).where(eq2(feedLikes.id, existing.id));
    return;
  }
  await db.insert(feedLikes).values({ postId, userId });
}
async function addFeedShare(postId, userId) {
  const [existing] = await db.select().from(feedShares).where(and2(eq2(feedShares.postId, postId), eq2(feedShares.userId, userId))).limit(1);
  if (!existing) {
    await db.insert(feedShares).values({ postId, userId });
  }
  await db.update(feedPosts).set({ expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1e3) }).where(eq2(feedPosts.id, postId));
}
async function addFeedComment(input) {
  await db.insert(feedComments).values({
    postId: input.postId,
    authorId: input.authorId,
    content: input.content
  });
}

// server/push.ts
init_storage();
init_schema();
import { and as and3, eq as eq3, inArray as inArray3 } from "drizzle-orm";
var EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
async function registerPushToken(userId, expoPushToken, platform) {
  const existing = await db.select().from(pushTokens).where(eq3(pushTokens.expoPushToken, expoPushToken)).limit(1);
  if (existing.length > 0) {
    await db.update(pushTokens).set({ userId, platform: platform || null, updatedAt: /* @__PURE__ */ new Date() }).where(eq3(pushTokens.expoPushToken, expoPushToken));
    return;
  }
  await db.insert(pushTokens).values({
    userId,
    expoPushToken,
    platform: platform || null
  });
}
async function unregisterPushToken(userId, expoPushToken) {
  if (expoPushToken) {
    await db.delete(pushTokens).where(and3(eq3(pushTokens.userId, userId), eq3(pushTokens.expoPushToken, expoPushToken)));
    return;
  }
  await db.delete(pushTokens).where(eq3(pushTokens.userId, userId));
}
async function sendExpoPush(messages) {
  if (messages.length === 0) return;
  const chunks = [];
  for (let i = 0; i < messages.length; i += 100) {
    chunks.push(messages.slice(i, i + 100));
  }
  for (const chunk of chunks) {
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(chunk.map((m) => ({
          to: m.to,
          title: m.title,
          body: m.body,
          data: m.data,
          sound: m.sound ?? "default",
          priority: "high"
        })))
      });
      if (!res.ok) {
        console.error("[Push] Expo API error:", res.status, await res.text());
      }
    } catch (e) {
      console.error("[Push] Failed to send:", e);
    }
  }
}
function messagePreview(message) {
  if (message.isDeleted) return "Message deleted";
  switch (message.type) {
    case "image":
      return "\u{1F4F7} Photo";
    case "audio":
      return "\u{1F3A4} Voice message";
    case "file":
      return message.fileName ? `\u{1F4CE} ${message.fileName}` : "\u{1F4CE} File";
    case "location":
      return message.locationName ? `\u{1F4CD} ${message.locationName}` : "\u{1F4CD} Location";
    case "contact":
      return message.sharedContactName ? `\u{1F464} ${message.sharedContactName}` : "\u{1F464} Contact";
    case "poll":
      return message.pollQuestion ? `\u{1F4CA} ${message.pollQuestion}` : "\u{1F4CA} Poll";
    default:
      if (message.content?.trim()) {
        const text2 = message.content.trim();
        return text2.length > 80 ? `${text2.slice(0, 77)}...` : text2;
      }
      return "New message";
  }
}
async function notifyChatMessage(chatId, senderId, message) {
  try {
    const { storage: storage2 } = await Promise.resolve().then(() => (init_storage(), storage_exports));
    const participants = await storage2.getChatParticipants(chatId);
    const recipientIds = participants.map((p) => p.userId).filter((id) => id !== senderId);
    if (recipientIds.length === 0) return;
    const recipientUsers = await db.select({
      id: users.id,
      notificationsEnabled: users.notificationsEnabled
    }).from(users).where(inArray3(users.id, recipientIds));
    const enabledIds = recipientUsers.filter((u) => u.notificationsEnabled !== false).map((u) => u.id);
    if (enabledIds.length === 0) return;
    for (const recipientId of enabledIds) {
      if (await storage2.isEitherUserBlocked(senderId, recipientId)) continue;
      const tokens = await db.select({ expoPushToken: pushTokens.expoPushToken }).from(pushTokens).where(eq3(pushTokens.userId, recipientId));
      if (tokens.length === 0) continue;
      const sender = await storage2.getUser(senderId);
      const senderName = sender ? `${sender.firstName} ${sender.lastName}`.trim() || sender.username : "Someone";
      const preview = messagePreview(message);
      await sendExpoPush(
        tokens.map((t) => ({
          to: t.expoPushToken,
          title: senderName,
          body: preview,
          data: {
            chatId,
            type: "message",
            messageId: message.id
          }
        }))
      );
    }
  } catch (e) {
    console.error("[Push] notifyChatMessage error:", e);
  }
}

// shared/content-filter.ts
var BLOCKED_PATTERNS = [
  /\b(fuck|fucking|fucker|motherfucker)\b/i,
  /\b(shit|shitty|bullshit)\b/i,
  /\b(bitch|bastard|asshole|dickhead)\b/i,
  /\b(cunt|whore|slut)\b/i,
  /\b(nigger|nigga|kike|spic|chink|gook|wetback)\b/i,
  /\b(faggot|fag)\b/i,
  /\b(porn|porno|xxx)\b/i,
  /\b(rape|rapist)\b/i,
  /\b(kill yourself|kys)\b/i
];
function containsBlockedContent(text2) {
  const normalized = text2.replace(/\s+/g, " ").trim();
  if (!normalized) return false;
  return BLOCKED_PATTERNS.some((pattern) => pattern.test(normalized));
}
var CONTENT_FILTER_MESSAGE = "This message contains language that isn't allowed under our Community Guidelines. Please revise it before sending.";

// server/lekker-connect.ts
var WID = process.env.LEKKER_WORKSPACE_ID;
var TOKEN = process.env.LEKKER_TOKEN;
if (!WID || !TOKEN) {
  console.warn("LEKKER_WORKSPACE_ID or LEKKER_TOKEN not set - Connect API calls will fail");
}
function isConnectConfigured() {
  return Boolean(WID && TOKEN);
}
var BASE = `https://lekker.network/api/connect/${WID}`;
async function call(path2, method = "GET", body, extraHeaders) {
  const url = `${BASE}${path2}${path2.includes("?") ? "&" : "?"}token=${TOKEN}`;
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...extraHeaders
    },
    body: body ? JSON.stringify(body) : void 0
  });
  if (!res.ok) {
    const text2 = await res.text();
    throw new Error(`Lekker API ${res.status}: ${text2}`);
  }
  return res.json();
}
async function submitContactToLekker(data) {
  return call("/contacts", "POST", data);
}
async function getFeed(params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => qs.append(k, String(v)));
  return call(`/feed?${qs.toString()}`);
}
async function searchProducts(params = {}) {
  const qs = new URLSearchParams(params);
  return call(`/products/search?${qs.toString()}`);
}
async function submitOrder(order) {
  return call("/orders", "POST", order);
}
async function createCheckout(data) {
  return call("/checkout", "POST", data);
}
async function getShippingQuote(data) {
  return call("/shipping/quote", "POST", data);
}
async function validateGiftCard(code) {
  return call(`/gift-cards/validate?code=${encodeURIComponent(code)}`);
}
async function requestPortalOtp(data) {
  return call("/portal/request-otp", "POST", data);
}
async function verifyPortalOtp(data) {
  return call("/portal/verify-otp", "POST", data);
}
async function getPortalMe(sessionToken) {
  return call("/portal/me", "GET", void 0, { "X-Portal-Token": sessionToken });
}

// server/routes.ts
function rejectBlockedContent(res, ...texts) {
  for (const text2 of texts) {
    if (text2 && containsBlockedContent(text2)) {
      res.status(400).json({ message: CONTENT_FILTER_MESSAGE, code: "CONTENT_BLOCKED" });
      return true;
    }
  }
  return false;
}
function normalizePhone2(raw) {
  const digits = raw.replace(/[\s\-().]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("0")) return "+27" + digits.slice(1);
  if (digits.startsWith("27")) return "+" + digits;
  if (digits.length >= 7) return "+27" + digits;
  return digits;
}
async function enrichParticipants(chatId) {
  const rawParticipants = await storage.getChatParticipants(chatId);
  const participantUsers = [];
  for (const p of rawParticipants) {
    const u = await storage.getUser(p.userId);
    if (u) {
      participantUsers.push({
        id: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        username: u.username,
        avatarColor: u.avatarColor,
        profilePhoto: u.profilePhoto,
        isVerifiedLekkerpreneur: u.isVerifiedLekkerpreneur,
        businessName: u.businessName,
        presence: u.presence
      });
    }
  }
  return participantUsers;
}
var openrouter = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY
});
var DIRECTORY_DATA = [
  { id: "d1", name: "Thabo Molefe", businessName: "Molefe Digital Solutions", serviceType: "IT & Technology", location: "Johannesburg", province: "Gauteng", phone: "+27821001001", bio: "Web development, app design, and digital transformation for SMEs.", avatarColor: "#4ECDC4", website: "https://molefedigital.co.za" },
  { id: "d2", name: "Naledi Khumalo", businessName: "Naledi Events & Decor", serviceType: "Events & Entertainment", location: "Durban", province: "KwaZulu-Natal", phone: "+27821002002", bio: "Premium event planning, styling, and venue decoration.", avatarColor: "#FF6B6B", website: "https://naledievents.co.za" },
  { id: "d3", name: "Sipho Nkosi", businessName: "Nkosi Construction", serviceType: "Construction & Building", location: "Pretoria", province: "Gauteng", phone: "+27821003003", bio: "Residential and commercial building, renovations, and project management.", avatarColor: "#45B7D1", website: "https://nkosiconstruction.co.za" },
  { id: "d4", name: "Lerato Dlamini", businessName: "Lerato's Kitchen", serviceType: "Food & Catering", location: "Soweto", province: "Gauteng", phone: "+27821004004", bio: "Catering for corporate events, weddings, and private functions.", avatarColor: "#96CEB4", website: "https://leratoskitchen.co.za" },
  { id: "d5", name: "Mandla Zulu", businessName: "Zulu Logistics", serviceType: "Transport & Logistics", location: "Cape Town", province: "Western Cape", phone: "+27821005005", bio: "Nationwide courier, freight, and last-mile delivery services.", avatarColor: "#FFEAA7", website: "https://zululogistics.co.za" },
  { id: "d6", name: "Ayanda Mthembu", businessName: "Ayanda Beauty Bar", serviceType: "Beauty & Wellness", location: "Sandton", province: "Gauteng", phone: "+27821006006", bio: "Hair styling, skincare treatments, nails, and wellness services.", avatarColor: "#DDA0DD", website: "https://ayandabeauty.co.za" },
  { id: "d7", name: "Bongani Sithole", businessName: "Sithole Legal Advisors", serviceType: "Legal & Consulting", location: "Bloemfontein", province: "Free State", phone: "+27821007007", bio: "Business law, contracts, compliance, and startup advisory.", avatarColor: "#85C1E9", website: "https://sitholelegal.co.za" },
  { id: "d8", name: "Zanele Moyo", businessName: "Z-Fit Wellness Studio", serviceType: "Health & Fitness", location: "Umhlanga", province: "KwaZulu-Natal", phone: "+27821008008", bio: "Personal training, group fitness, yoga, and nutrition coaching.", avatarColor: "#F7DC6F", website: "https://zfitwellness.co.za" },
  { id: "d9", name: "Kagiso Patel", businessName: "KP Marketing Agency", serviceType: "Marketing & Advertising", location: "Rosebank", province: "Gauteng", phone: "+27821009009", bio: "Social media management, branding, content creation, and digital ads.", avatarColor: "#BB8FCE", website: "https://kpmarketing.co.za" },
  { id: "d10", name: "Nomsa Ndlovu", businessName: "Nomsa Fashion House", serviceType: "Fashion & Clothing", location: "Stellenbosch", province: "Western Cape", phone: "+27821010010", bio: "Custom tailoring, African print designs, and fashion retail.", avatarColor: "#98D8C8", website: "https://nomsafashion.co.za" },
  { id: "d11", name: "Tshepo Mahlangu", businessName: "Mahlangu Auto Repairs", serviceType: "Automotive", location: "Midrand", province: "Gauteng", phone: "+27821011011", bio: "Vehicle repairs, servicing, panel beating, and diagnostics.", avatarColor: "#FF6B6B", website: "https://mahlangu-auto.co.za" },
  { id: "d12", name: "Palesa Maseko", businessName: "Maseko Accounting", serviceType: "Finance & Accounting", location: "Centurion", province: "Gauteng", phone: "+27821012012", bio: "Tax returns, bookkeeping, payroll, and financial planning for SMEs.", avatarColor: "#4ECDC4", website: "https://masekoaccounting.co.za" },
  { id: "d13", name: "Vusi Dube", businessName: "Dube Agri-Solutions", serviceType: "Agriculture", location: "Nelspruit", province: "Mpumalanga", phone: "+27821013013", bio: "Farm management, crop consulting, and agri-tech solutions.", avatarColor: "#96CEB4", website: "https://dubeagri.co.za" },
  { id: "d14", name: "Lindiwe Shabalala", businessName: "Lindi Tutoring Hub", serviceType: "Education & Training", location: "Pietermaritzburg", province: "KwaZulu-Natal", phone: "+27821014014", bio: "Tutoring, exam prep, skills development, and online courses.", avatarColor: "#45B7D1", website: "https://linditutoring.co.za" },
  { id: "d15", name: "Themba Mokoena", businessName: "Mokoena Properties", serviceType: "Real Estate", location: "East London", province: "Eastern Cape", phone: "+27821015015", bio: "Property sales, rentals, valuations, and investment advisory.", avatarColor: "#F7DC6F", website: "https://mokoenaproperties.co.za" }
];
var SERVICE_TYPES = [...new Set(DIRECTORY_DATA.map((d) => d.serviceType))].sort();
var PROVINCES = [...new Set(DIRECTORY_DATA.map((d) => d.province))].sort();
var loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1e3,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many login attempts. Please try again in 15 minutes." },
  validate: { xForwardedForHeader: false }
});
var registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1e3,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many registration attempts. Please try again later." },
  validate: { xForwardedForHeader: false }
});
function sanitizeUser(user) {
  const { passwordHash, ...safe } = user;
  return safe;
}
var AVATAR_COLORS = ["#4ECDC4", "#FF6B6B", "#45B7D1", "#96CEB4", "#FFEAA7", "#DDA0DD", "#85C1E9", "#F7DC6F", "#BB8FCE", "#98D8C8"];
async function applyLekkerSync(user, req) {
  let finalUser = user;
  try {
    const lekkerMatch = await findLekkerpreneurByPhoneOrEmail(user.phone, user.email);
    if (lekkerMatch) {
      const profileData = extractLekkerpreneurProfile(lekkerMatch);
      let workspaceEmailActive = false;
      if (profileData.lekkerWorkspaceId) {
        const emailStatus = await fetchWorkspaceEmailStatus(profileData.lekkerWorkspaceId);
        workspaceEmailActive = emailStatus.active;
      }
      const updated = await storage.updateUser(user.id, {
        ...profileData,
        workspaceEmailActive
      });
      if (updated) {
        finalUser = updated;
        await storage.logAuthEvent(
          "lekker_network_match",
          user.id,
          req.ip,
          void 0,
          `Matched Lekkerpreneur: ${lekkerMatch.businessName} (${lekkerMatch.id})`
        );
      }
    }
  } catch (e) {
    console.error("Lekker Network sync (non-fatal):", e);
  }
  return finalUser;
}
async function resolveUniqueUsername(phone) {
  let base = phoneToUsername(phone);
  let candidate = base;
  let n = 0;
  while (await storage.getUserByUsername(candidate)) {
    n += 1;
    candidate = `${base}_${n}`;
  }
  return candidate;
}
var phoneVerifyLimiter = rateLimit({
  windowMs: 60 * 60 * 1e3,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many verification attempts. Please try again in an hour." },
  validate: { xForwardedForHeader: false },
  skip: (req) => {
    const raw = req.body?.phone;
    return raw ? isAppleReviewPhone(String(raw)) : false;
  }
});
async function handleAppleReviewVerify(req, res, phone, displayName) {
  const config = getAppleReviewConfig();
  if (!config) {
    res.status(503).json({ message: "Apple Review login is not configured." });
    return;
  }
  let user = await storage.getUserByPhone(phone);
  if (!user) {
    const name = (displayName || config.displayName).trim();
    if (!name || name.length < 2) {
      res.status(200).json({
        needsDisplayName: true,
        message: "Enter your display name to create your account"
      });
      return;
    }
    const email = phoneToPlaceholderEmail(phone);
    const username = await resolveUniqueUsername(phone);
    const randomColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
    user = await storage.createUser({
      phone,
      email,
      username,
      firstName: name,
      lastName: "",
      passwordHash: null,
      avatarColor: randomColor,
      role: "user",
      emailVerified: true,
      phoneVerified: true,
      lekkerNetworkAccess: false,
      autoReplyEnabled: false,
      notificationsEnabled: true,
      locationEnabled: false,
      presence: "online"
    });
    await storage.addUserEmail(user.id, email, true, true);
    await storage.logAuthEvent("register_apple_review", user.id, req.ip, req.headers["user-agent"]?.toString());
  } else {
    await storage.updateUser(user.id, { phoneVerified: true, emailVerified: true });
    const emails = await storage.getUserEmails(user.id);
    for (const row of emails) {
      if (!row.isVerified) {
        await storage.verifyUserEmail(row.id, user.id);
      }
    }
    user = await storage.getUser(user.id);
    await storage.logAuthEvent("login_apple_review", user.id, req.ip, req.headers["user-agent"]?.toString());
  }
  const synced = await applyLekkerSync(user, req);
  const token = generateToken({ userId: synced.id, email: synced.email, role: synced.role });
  res.json({ user: sanitizeUser(synced), token });
}
async function registerRoutes(app2) {
  app2.post("/api/auth/send-phone-code", phoneVerifyLimiter, async (req, res) => {
    try {
      const rawPhone = req.body.phone;
      if (!rawPhone || rawPhone.trim().length < 6) {
        return res.status(400).json({ message: "Valid phone number is required" });
      }
      const phone = normalizePhone2(rawPhone.trim());
      const existingUser = await storage.getUserByPhone(phone);
      if (existingUser) {
        return res.status(409).json({ message: "An account with this phone number already exists", field: "phone" });
      }
      await db.delete(phoneVerificationCodes).where(eq4(phoneVerificationCodes.phone, phone));
      const code = Math.floor(1e5 + Math.random() * 9e5).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1e3);
      await db.insert(phoneVerificationCodes).values({
        phone,
        code,
        verified: false,
        used: false,
        expiresAt
      });
      await sendPhoneVerificationSMS(phone, code);
      res.json({ message: "Verification code sent to your phone" });
    } catch (err) {
      console.error("Send phone code error:", err);
      res.status(500).json({ message: "Failed to send verification code. Please try again." });
    }
  });
  app2.post("/api/auth/send-email-code", phoneVerifyLimiter, async (req, res) => {
    try {
      const { email, firstName } = req.body;
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ message: "Valid email address is required" });
      }
      const existingUser = await storage.getUserByEmail(email.trim().toLowerCase());
      if (existingUser) {
        return res.status(409).json({ message: "An account with this email already exists", field: "email" });
      }
      await db.delete(emailVerificationCodes).where(eq4(emailVerificationCodes.email, email.trim().toLowerCase()));
      const code = Math.floor(1e5 + Math.random() * 9e5).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1e3);
      await db.insert(emailVerificationCodes).values({
        email: email.trim().toLowerCase(),
        code,
        verified: false,
        used: false,
        expiresAt
      });
      await sendEmailVerificationEmail(email.trim().toLowerCase(), code, firstName || "there");
      res.json({ message: "Verification code sent to your email" });
    } catch (err) {
      console.error("Send email code error:", err);
      res.status(500).json({ message: "Failed to send email verification code. Please try again." });
    }
  });
  app2.post("/api/auth/verify-email-code", phoneVerifyLimiter, async (req, res) => {
    try {
      const { email, code } = req.body;
      if (!email || !code) {
        return res.status(400).json({ message: "Email and code are required" });
      }
      const [record] = await db.select().from(emailVerificationCodes).where(eq4(emailVerificationCodes.email, email.trim().toLowerCase())).orderBy(emailVerificationCodes.createdAt).limit(1);
      if (!record) {
        return res.status(400).json({ message: "No verification code found. Please request a new code." });
      }
      if (record.used) {
        return res.status(400).json({ message: "This code has already been used. Please request a new code." });
      }
      if (/* @__PURE__ */ new Date() > record.expiresAt) {
        return res.status(400).json({ message: "This code has expired. Please request a new code." });
      }
      if (record.code !== code.trim()) {
        return res.status(400).json({ message: "Incorrect code. Please try again." });
      }
      await db.update(emailVerificationCodes).set({ verified: true }).where(eq4(emailVerificationCodes.id, record.id));
      res.json({ verified: true, emailVerificationId: record.id });
    } catch (err) {
      console.error("Verify email code error:", err);
      res.status(500).json({ message: "Verification failed. Please try again." });
    }
  });
  app2.post("/api/auth/verify-phone-code", phoneVerifyLimiter, async (req, res) => {
    try {
      const { code } = req.body;
      const phone = req.body.phone ? normalizePhone2(req.body.phone.trim()) : "";
      if (!phone || !code) {
        return res.status(400).json({ message: "Phone number and code are required" });
      }
      const [record] = await db.select().from(phoneVerificationCodes).where(eq4(phoneVerificationCodes.phone, phone)).orderBy(phoneVerificationCodes.createdAt).limit(1);
      if (!record) {
        return res.status(400).json({ message: "No verification code found. Please request a new code." });
      }
      if (record.used) {
        return res.status(400).json({ message: "This code has already been used. Please request a new code." });
      }
      if (/* @__PURE__ */ new Date() > record.expiresAt) {
        return res.status(400).json({ message: "This code has expired. Please request a new code." });
      }
      if (record.code !== code.trim()) {
        return res.status(400).json({ message: "Incorrect code. Please try again." });
      }
      await db.update(phoneVerificationCodes).set({ verified: true }).where(eq4(phoneVerificationCodes.id, record.id));
      res.json({ verified: true, verificationId: record.id });
    } catch (err) {
      console.error("Verify phone code error:", err);
      res.status(500).json({ message: "Verification failed. Please try again." });
    }
  });
  app2.post("/api/auth/whatsapp/send-code", phoneVerifyLimiter, async (req, res) => {
    try {
      const rawPhone = req.body.phone;
      if (!rawPhone || String(rawPhone).trim().length < 6) {
        return res.status(400).json({ message: "Valid phone number is required" });
      }
      const phone = normaliseMobile(String(rawPhone).trim());
      if (!phone) {
        return res.status(400).json({ message: "Could not parse phone number" });
      }
      if (isAppleReviewPhone(phone)) {
        const existing2 = await storage.getUserByPhone(phone);
        return res.json({
          message: "Verification code sent via WhatsApp",
          isExistingUser: !!existing2
        });
      }
      await db.delete(phoneVerificationCodes).where(eq4(phoneVerificationCodes.phone, phone));
      const code = Math.floor(1e5 + Math.random() * 9e5).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1e3);
      await db.insert(phoneVerificationCodes).values({
        phone,
        code,
        verified: false,
        used: false,
        expiresAt
      });
      await sendWhatsAppOtp(phone, code);
      const existing = await storage.getUserByPhone(phone);
      res.json({
        message: "Verification code sent via WhatsApp",
        isExistingUser: !!existing
      });
    } catch (err) {
      console.error("WhatsApp send-code error:", err);
      res.status(500).json({ message: "Failed to send WhatsApp code. Please try again." });
    }
  });
  app2.post("/api/auth/whatsapp/verify", phoneVerifyLimiter, async (req, res) => {
    try {
      const { code, displayName } = req.body;
      const phone = req.body.phone ? normaliseMobile(String(req.body.phone).trim()) : null;
      if (!phone || !code) {
        return res.status(400).json({ message: "Phone number and code are required" });
      }
      if (isAppleReviewLogin(phone, String(code).trim())) {
        await handleAppleReviewVerify(req, res, phone, displayName);
        return;
      }
      const [record] = await db.select().from(phoneVerificationCodes).where(eq4(phoneVerificationCodes.phone, phone)).orderBy(phoneVerificationCodes.createdAt).limit(1);
      if (!record) {
        return res.status(400).json({ message: "No verification code found. Please request a new code." });
      }
      if (record.used) {
        return res.status(400).json({ message: "This code has already been used." });
      }
      if (/* @__PURE__ */ new Date() > record.expiresAt) {
        return res.status(400).json({ message: "This code has expired. Please request a new code." });
      }
      if (record.code !== String(code).trim()) {
        return res.status(400).json({ message: "Incorrect code. Please try again." });
      }
      await db.update(phoneVerificationCodes).set({ verified: true, used: true }).where(eq4(phoneVerificationCodes.id, record.id));
      let user = await storage.getUserByPhone(phone);
      if (!user) {
        const name = (displayName || "").trim();
        if (!name || name.length < 2) {
          return res.status(200).json({
            needsDisplayName: true,
            message: "Enter your display name to create your account"
          });
        }
        const email = phoneToPlaceholderEmail(phone);
        const username = await resolveUniqueUsername(phone);
        const randomColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
        user = await storage.createUser({
          phone,
          email,
          username,
          firstName: name,
          lastName: "",
          passwordHash: null,
          avatarColor: randomColor,
          role: "user",
          emailVerified: false,
          phoneVerified: true,
          lekkerNetworkAccess: false,
          autoReplyEnabled: false,
          notificationsEnabled: true,
          locationEnabled: false,
          presence: "online"
        });
        await storage.addUserEmail(user.id, email, true, false);
        await storage.logAuthEvent("register_whatsapp", user.id, req.ip, req.headers["user-agent"]?.toString());
      } else {
        if (!user.phoneVerified) {
          await storage.updateUser(user.id, { phoneVerified: true });
          user = await storage.getUser(user.id);
        }
        await storage.logAuthEvent("login_whatsapp", user.id, req.ip, req.headers["user-agent"]?.toString());
      }
      const synced = await applyLekkerSync(user, req);
      const token = generateToken({ userId: synced.id, email: synced.email, role: synced.role });
      res.json({ user: sanitizeUser(synced), token });
    } catch (err) {
      console.error("WhatsApp verify error:", err);
      res.status(500).json({ message: "Verification failed. Please try again." });
    }
  });
  app2.post("/api/auth/register", registerLimiter, async (req, res) => {
    try {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        const errors = parsed.error.errors.map((e) => ({ field: e.path.join("."), message: e.message }));
        return res.status(400).json({ message: "Validation failed", errors });
      }
      const { email, username, firstName, lastName, password } = parsed.data;
      const phone = normalizePhone2(parsed.data.phone.trim());
      const { verificationId, emailVerificationId } = req.body;
      let phoneVerified = false;
      let emailVerifiedFlag = false;
      if (verificationId) {
        const [phoneRecord] = await db.select().from(phoneVerificationCodes).where(eq4(phoneVerificationCodes.id, verificationId)).limit(1);
        if (!phoneRecord || !phoneRecord.verified || phoneRecord.used) {
          return res.status(400).json({ message: "Invalid or expired phone verification. Please request a new code.", field: "phone" });
        }
        if (phoneRecord.phone !== phone) {
          return res.status(400).json({ message: "Phone number does not match the verified number.", field: "phone" });
        }
        if (/* @__PURE__ */ new Date() > phoneRecord.expiresAt) {
          return res.status(400).json({ message: "Phone verification has expired. Please request a new code.", field: "phone" });
        }
        phoneVerified = true;
      }
      if (emailVerificationId) {
        const [emailRecord] = await db.select().from(emailVerificationCodes).where(eq4(emailVerificationCodes.id, emailVerificationId)).limit(1);
        if (!emailRecord || !emailRecord.verified || emailRecord.used) {
          return res.status(400).json({ message: "Invalid or expired email verification. Please request a new code.", field: "email" });
        }
        if (emailRecord.email !== email.trim().toLowerCase()) {
          return res.status(400).json({ message: "Email does not match the verified email.", field: "email" });
        }
        if (/* @__PURE__ */ new Date() > emailRecord.expiresAt) {
          return res.status(400).json({ message: "Email verification has expired. Please request a new code.", field: "email" });
        }
        emailVerifiedFlag = true;
      }
      const existingEmail = await storage.getUserByEmail(email);
      if (existingEmail) {
        return res.status(409).json({ message: "An account with this email already exists", field: "email" });
      }
      const existingPhone = await storage.getUserByPhone(phone);
      if (existingPhone) {
        return res.status(409).json({ message: "An account with this phone number already exists", field: "phone" });
      }
      const existingUsername = await storage.getUserByUsername(username);
      if (existingUsername) {
        return res.status(409).json({ message: "This username is already taken", field: "username" });
      }
      const markUsedOps = [];
      if (verificationId) markUsedOps.push(db.update(phoneVerificationCodes).set({ used: true }).where(eq4(phoneVerificationCodes.id, verificationId)));
      if (emailVerificationId) markUsedOps.push(db.update(emailVerificationCodes).set({ used: true }).where(eq4(emailVerificationCodes.id, emailVerificationId)));
      if (markUsedOps.length > 0) await Promise.all(markUsedOps);
      const passwordHash = await hashPassword(password);
      const AVATAR_COLORS2 = ["#4ECDC4", "#FF6B6B", "#45B7D1", "#96CEB4", "#FFEAA7", "#DDA0DD", "#85C1E9", "#F7DC6F", "#BB8FCE", "#98D8C8"];
      const randomColor = AVATAR_COLORS2[Math.floor(Math.random() * AVATAR_COLORS2.length)];
      const user = await storage.createUser({
        phone,
        email,
        username,
        firstName,
        lastName,
        passwordHash,
        avatarColor: randomColor,
        role: "user",
        emailVerified: emailVerifiedFlag,
        phoneVerified,
        lekkerNetworkAccess: false,
        autoReplyEnabled: false,
        notificationsEnabled: true,
        locationEnabled: false,
        presence: "online"
      });
      await storage.addUserEmail(user.id, email.trim().toLowerCase(), true, emailVerifiedFlag);
      const token = generateToken({ userId: user.id, email: user.email, role: user.role });
      await storage.logAuthEvent("register", user.id, req.ip, req.headers["user-agent"]?.toString());
      let finalUser = user;
      try {
        const lekkerMatch = await findLekkerpreneurByPhoneOrEmail(phone, email);
        if (lekkerMatch) {
          const profileData = extractLekkerpreneurProfile(lekkerMatch);
          const updated = await storage.updateUser(user.id, profileData);
          if (updated) finalUser = updated;
          await storage.logAuthEvent("lekker_network_match", user.id, req.ip, void 0, `Matched Lekkerpreneur: ${lekkerMatch.businessName} (${lekkerMatch.id})`);
        }
      } catch (e) {
        console.error("Lekker Network lookup on register (non-fatal):", e);
      }
      res.status(201).json({ user: sanitizeUser(finalUser), token });
    } catch (error) {
      console.error("Registration error:", error);
      if (error?.code === "23505") {
        return res.status(409).json({ message: "An account with these details already exists" });
      }
      res.status(500).json({ message: "Registration failed. Please try again." });
    }
  });
  app2.post("/api/auth/login", loginLimiter, async (req, res) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Please provide your email/phone and password" });
      }
      const { identifier, password } = parsed.data;
      const user = await storage.getUserByIdentifier(identifier);
      if (!user) {
        await storage.logAuthEvent("login_failed", void 0, req.ip, req.headers["user-agent"]?.toString(), `identifier: ${identifier}`);
        return res.status(401).json({ message: "Invalid credentials" });
      }
      const isValid = await verifyPassword(password, user.passwordHash);
      if (!isValid) {
        await storage.logAuthEvent("login_failed", user.id, req.ip, req.headers["user-agent"]?.toString());
        return res.status(401).json({ message: "Invalid credentials" });
      }
      const token = generateToken({ userId: user.id, email: user.email, role: user.role });
      await storage.logAuthEvent("login_success", user.id, req.ip, req.headers["user-agent"]?.toString());
      let finalUser = user;
      if (!user.lekkerNetworkId) {
        try {
          const lekkerMatch = await findLekkerpreneurByPhoneOrEmail(user.phone, user.email);
          if (lekkerMatch) {
            const profileData = extractLekkerpreneurProfile(lekkerMatch);
            const updated = await storage.updateUser(user.id, profileData);
            if (updated) finalUser = updated;
            await storage.logAuthEvent("lekker_network_match", user.id, req.ip, void 0, `Matched Lekkerpreneur: ${lekkerMatch.businessName} (${lekkerMatch.id})`);
          }
        } catch (e) {
          console.error("Lekker Network lookup on login (non-fatal):", e);
        }
      }
      res.json({ user: sanitizeUser(finalUser), token });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed. Please try again." });
    }
  });
  const resetRequestLimiter = rateLimit({
    windowMs: 15 * 60 * 1e3,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many reset requests. Please try again later." },
    validate: { xForwardedForHeader: false }
  });
  app2.post("/api/auth/forgot-password", resetRequestLimiter, async (req, res) => {
    try {
      const { identifier } = req.body;
      if (!identifier || typeof identifier !== "string") {
        return res.status(400).json({ message: "Email or phone number is required" });
      }
      const trimmed = identifier.trim().toLowerCase();
      const isPhone = /^\+?\d[\d\s-]{5,}$/.test(trimmed);
      let user;
      if (isPhone) {
        const cleanPhone = trimmed.replace(/[\s-]/g, "");
        user = await storage.getUserByPhone(cleanPhone);
      } else {
        user = await storage.getUserByEmail(trimmed);
      }
      if (!user) {
        return res.json({ message: "If an account exists, a reset code has been sent." });
      }
      const code = Math.floor(1e5 + Math.random() * 9e5).toString();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1e3);
      await db.insert(passwordResetCodes).values({
        userId: user.id,
        email: user.email,
        code,
        used: false,
        expiresAt
      });
      await storage.logAuthEvent("password_reset_requested", user.id, req.ip, req.headers["user-agent"]?.toString());
      const smsSent = await sendPasswordResetSMS(user.phone, code, user.firstName);
      if (!smsSent) {
        console.error(`[Password Reset] Failed to send SMS to ${user.phone}`);
      }
      const emailSent = await sendPasswordResetEmail(user.email, code, user.firstName);
      if (!emailSent) {
        console.error(`[Password Reset] Failed to send email to ${user.email}`);
      }
      res.json({ message: "If an account exists, a reset code has been sent." });
    } catch (error) {
      console.error("Forgot password error:", error);
      res.status(500).json({ message: "Something went wrong. Please try again." });
    }
  });
  async function resolveIdentifierToEmail(identifier) {
    const trimmed = identifier.trim().toLowerCase();
    const isPhone = /^\+?\d[\d\s-]{5,}$/.test(trimmed);
    if (isPhone) {
      const cleanPhone = trimmed.replace(/[\s-]/g, "");
      const user = await storage.getUserByPhone(cleanPhone);
      return user?.email || null;
    }
    return trimmed;
  }
  app2.post("/api/auth/verify-reset-code", resetRequestLimiter, async (req, res) => {
    try {
      const { email, code } = req.body;
      if (!email || !code) {
        return res.status(400).json({ message: "Email or phone and code are required" });
      }
      const resolvedEmail = await resolveIdentifierToEmail(email);
      if (!resolvedEmail) {
        return res.status(400).json({ message: "Invalid or expired reset code" });
      }
      const resetCodes = await db.select().from(passwordResetCodes).where(
        and4(
          eq4(passwordResetCodes.email, resolvedEmail),
          eq4(passwordResetCodes.code, code.trim()),
          eq4(passwordResetCodes.used, false)
        )
      ).orderBy(sql4`created_at DESC`).limit(1);
      if (resetCodes.length === 0) {
        return res.status(400).json({ message: "Invalid or expired reset code" });
      }
      const resetCode = resetCodes[0];
      if (/* @__PURE__ */ new Date() > resetCode.expiresAt) {
        return res.status(400).json({ message: "Reset code has expired. Please request a new one." });
      }
      res.json({ valid: true, message: "Code verified successfully" });
    } catch (error) {
      console.error("Verify reset code error:", error);
      res.status(500).json({ message: "Something went wrong. Please try again." });
    }
  });
  app2.post("/api/auth/reset-password", resetRequestLimiter, async (req, res) => {
    try {
      const { email, code, newPassword } = req.body;
      if (!email || !code || !newPassword) {
        return res.status(400).json({ message: "Identifier, code, and new password are required" });
      }
      if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
        return res.status(400).json({ message: "Password must be at least 8 characters with uppercase, number, and special character" });
      }
      const resolvedEmail = await resolveIdentifierToEmail(email);
      if (!resolvedEmail) {
        return res.status(400).json({ message: "Invalid or expired reset code" });
      }
      const resetCodes = await db.select().from(passwordResetCodes).where(
        and4(
          eq4(passwordResetCodes.email, resolvedEmail),
          eq4(passwordResetCodes.code, code.trim()),
          eq4(passwordResetCodes.used, false)
        )
      ).orderBy(sql4`created_at DESC`).limit(1);
      if (resetCodes.length === 0) {
        return res.status(400).json({ message: "Invalid or expired reset code" });
      }
      const resetCode = resetCodes[0];
      if (/* @__PURE__ */ new Date() > resetCode.expiresAt) {
        return res.status(400).json({ message: "Reset code has expired. Please request a new one." });
      }
      const newHash = await hashPassword(newPassword);
      await storage.updateUser(resetCode.userId, { passwordHash: newHash });
      await db.update(passwordResetCodes).set({ used: true }).where(eq4(passwordResetCodes.id, resetCode.id));
      await storage.logAuthEvent("password_reset_success", resetCode.userId, req.ip, req.headers["user-agent"]?.toString());
      res.json({ message: "Password has been reset successfully. You can now sign in." });
    } catch (error) {
      console.error("Reset password error:", error);
      res.status(500).json({ message: "Something went wrong. Please try again." });
    }
  });
  app2.get("/api/auth/me", authMiddleware, async (req, res) => {
    try {
      const user = await storage.getUser(req.user.userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json({ user: sanitizeUser(user) });
    } catch (error) {
      console.error("Get profile error:", error);
      res.status(500).json({ message: "Failed to fetch profile" });
    }
  });
  app2.get("/api/auth/emails", authMiddleware, async (req, res) => {
    try {
      const emails = await storage.getUserEmails(req.user.userId);
      res.json({ emails });
    } catch (error) {
      console.error("Get emails error:", error);
      res.status(500).json({ message: "Failed to fetch linked emails" });
    }
  });
  app2.post("/api/auth/add-email", authMiddleware, rateLimit({ windowMs: 15 * 60 * 1e3, max: 5 }), async (req, res) => {
    try {
      const { email } = req.body;
      if (!email || typeof email !== "string" || !email.includes("@")) {
        return res.status(400).json({ message: "A valid email address is required" });
      }
      const normalized = email.trim().toLowerCase();
      const exists = await storage.emailExistsAnywhere(normalized);
      if (exists) {
        return res.status(409).json({ message: "This email is already linked to an account" });
      }
      const userId = req.user.userId;
      const pending = await storage.addUserEmail(userId, normalized, false, false);
      const code = Math.floor(1e5 + Math.random() * 9e5).toString();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1e3);
      await db.insert(emailVerificationCodes).values({ email: normalized, code, expiresAt });
      try {
        const userForEmail = await storage.getUser(userId);
        await sendEmailVerificationEmail(normalized, code, userForEmail?.firstName || "there");
      } catch (e) {
        console.error("Failed to send verification email (non-fatal):", e);
      }
      res.status(201).json({ emailId: pending.id, message: "Verification code sent to " + normalized });
    } catch (error) {
      console.error("Add email error:", error);
      res.status(500).json({ message: "Failed to add email" });
    }
  });
  app2.post("/api/auth/verify-linked-email", authMiddleware, rateLimit({ windowMs: 15 * 60 * 1e3, max: 10 }), async (req, res) => {
    try {
      const { emailId, code } = req.body;
      if (!emailId || !code) return res.status(400).json({ message: "emailId and code are required" });
      const userId = req.user.userId;
      const emails = await storage.getUserEmails(userId);
      const target = emails.find((e) => e.id === emailId);
      if (!target) return res.status(404).json({ message: "Email not found" });
      if (target.isVerified) return res.status(400).json({ message: "Email is already verified" });
      const [codeRecord] = await db.select().from(emailVerificationCodes).where(eq4(emailVerificationCodes.email, target.email)).orderBy(emailVerificationCodes.createdAt).limit(1);
      if (!codeRecord || codeRecord.code !== code || codeRecord.used) {
        return res.status(400).json({ message: "Invalid or expired verification code" });
      }
      if (/* @__PURE__ */ new Date() > codeRecord.expiresAt) {
        return res.status(400).json({ message: "Verification code has expired. Please request a new one." });
      }
      await db.update(emailVerificationCodes).set({ used: true, verified: true }).where(eq4(emailVerificationCodes.id, codeRecord.id));
      await storage.verifyUserEmail(emailId, userId);
      res.json({ message: "Email verified successfully" });
    } catch (error) {
      console.error("Verify linked email error:", error);
      res.status(500).json({ message: "Failed to verify email" });
    }
  });
  app2.delete("/api/auth/emails/:emailId", authMiddleware, async (req, res) => {
    try {
      const { emailId } = req.params;
      const userId = req.user.userId;
      const emails = await storage.getUserEmails(userId);
      const target = emails.find((e) => e.id === emailId);
      if (!target) return res.status(404).json({ message: "Email not found" });
      if (target.isPrimary) return res.status(400).json({ message: "Cannot remove your primary email" });
      if (emails.length === 1) return res.status(400).json({ message: "Cannot remove your only email address" });
      const removed = await storage.removeUserEmail(emailId, userId);
      if (!removed) return res.status(400).json({ message: "Could not remove email" });
      const remaining = await storage.getUserEmails(userId);
      const anyVerified = remaining.some((e) => e.isVerified);
      if (!anyVerified) {
        await storage.updateUser(userId, { emailVerified: false });
      }
      res.json({ message: "Email removed" });
    } catch (error) {
      console.error("Remove email error:", error);
      res.status(500).json({ message: "Failed to remove email" });
    }
  });
  app2.post("/api/auth/resend-linked-email-code", authMiddleware, rateLimit({ windowMs: 5 * 60 * 1e3, max: 3 }), async (req, res) => {
    try {
      const { emailId } = req.body;
      if (!emailId) return res.status(400).json({ message: "emailId is required" });
      const userId = req.user.userId;
      const emails = await storage.getUserEmails(userId);
      const target = emails.find((e) => e.id === emailId);
      if (!target) return res.status(404).json({ message: "Email not found" });
      if (target.isVerified) return res.status(400).json({ message: "Email is already verified" });
      const code = Math.floor(1e5 + Math.random() * 9e5).toString();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1e3);
      await db.insert(emailVerificationCodes).values({ email: target.email, code, expiresAt });
      try {
        const userForEmail = await storage.getUser(userId);
        await sendEmailVerificationEmail(target.email, code, userForEmail?.firstName || "there");
      } catch (e) {
        console.error("Failed to resend verification email:", e);
      }
      res.json({ message: "Verification code resent" });
    } catch (error) {
      res.status(500).json({ message: "Failed to resend code" });
    }
  });
  app2.put("/api/auth/profile", authMiddleware, async (req, res) => {
    try {
      const parsed = updateProfileSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid profile data" });
      }
      if (parsed.data.username) {
        const existing = await storage.getUserByUsername(parsed.data.username.toLowerCase());
        if (existing && existing.id !== req.user.userId) {
          return res.status(409).json({ message: "Username is already taken" });
        }
        parsed.data.username = parsed.data.username.toLowerCase();
      }
      const user = await storage.updateUser(req.user.userId, parsed.data);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json({ user: sanitizeUser(user) });
    } catch (error) {
      console.error("Update profile error:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });
  app2.post("/api/admin/seed-test-user", async (req, res) => {
    const apiKey = req.headers["x-api-key"];
    if (!apiKey || apiKey !== process.env.LEKKER_NETWORK_API_KEY) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const existing = await storage.getUserByEmail("test@lekker.chat");
      if (existing) {
        return res.json({ message: "Test user already exists", email: "test@lekker.chat", phone: "+27000000001", password: "Lekker@2026" });
      }
      const passwordHash = await hashPassword("Lekker@2026");
      const user = await storage.createUser({
        phone: "+27000000001",
        email: "test@lekker.chat",
        username: "testuser",
        firstName: "Test",
        lastName: "User",
        passwordHash,
        avatarColor: "#F5B800",
        role: "user",
        emailVerified: true,
        phoneVerified: true,
        lekkerNetworkAccess: false,
        autoReplyEnabled: false,
        notificationsEnabled: true,
        locationEnabled: false,
        presence: "online"
      });
      res.json({ message: "Test user created", email: "test@lekker.chat", phone: "+27000000001", password: "Lekker@2026", id: user.id });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });
  app2.post("/api/auth/logout", authMiddleware, async (req, res) => {
    await storage.logAuthEvent("logout", req.user.userId, req.ip, req.headers["user-agent"]?.toString());
    res.json({ message: "Logged out successfully" });
  });
  app2.delete("/api/auth/account", authMiddleware, async (req, res) => {
    try {
      const userId = req.user.userId;
      await storage.logAuthEvent("account_deleted", userId, req.ip, req.headers["user-agent"]?.toString());
      await storage.deleteUserAccount(userId);
      res.json({ message: "Account deleted successfully" });
    } catch (err) {
      console.error("Account deletion error:", err);
      res.status(500).json({ message: "Failed to delete account. Please try again." });
    }
  });
  async function resolveOrCreateP2PChat(userId, participantId) {
    if (participantId === userId) {
      return { error: "Cannot create chat with yourself", status: 400 };
    }
    if (await storage.isEitherUserBlocked(userId, participantId)) {
      return { error: "You cannot message this user", status: 403, code: "BLOCKED" };
    }
    const otherUser = await storage.getUser(participantId);
    if (!otherUser) {
      return { error: "User not found", status: 404 };
    }
    const existing = await storage.findExistingP2PChat(userId, participantId);
    if (existing) {
      const participants2 = await enrichParticipants(existing.id);
      return { chat: { ...existing, participants: participants2 }, status: 200 };
    }
    const chat = await storage.createChat("p2p", userId);
    await storage.addChatParticipant(chat.id, userId, "owner");
    await storage.addChatParticipant(chat.id, participantId, "member");
    const participants = await enrichParticipants(chat.id);
    return { chat: { ...chat, participants }, status: 201 };
  }
  app2.get("/api/safety/blocks", authMiddleware, async (req, res) => {
    try {
      const blocks = await storage.getBlockedUsers(req.user.userId);
      res.json({ blocks });
    } catch (error) {
      console.error("List blocks error:", error);
      res.status(500).json({ message: "Failed to load blocked users" });
    }
  });
  app2.post("/api/safety/block", authMiddleware, async (req, res) => {
    try {
      const { userId: blockedUserId } = req.body || {};
      const blockerId = req.user.userId;
      if (!blockedUserId || typeof blockedUserId !== "string") {
        return res.status(400).json({ message: "userId is required" });
      }
      if (blockedUserId === blockerId) {
        return res.status(400).json({ message: "You cannot block yourself" });
      }
      const target = await storage.getUser(blockedUserId);
      if (!target) return res.status(404).json({ message: "User not found" });
      await storage.blockUser(blockerId, blockedUserId);
      res.json({ ok: true });
    } catch (error) {
      console.error("Block user error:", error);
      res.status(500).json({ message: "Failed to block user" });
    }
  });
  app2.delete("/api/safety/block/:userId", authMiddleware, async (req, res) => {
    try {
      await storage.unblockUser(req.user.userId, req.params.userId);
      res.json({ ok: true });
    } catch (error) {
      console.error("Unblock user error:", error);
      res.status(500).json({ message: "Failed to unblock user" });
    }
  });
  app2.post("/api/safety/report", authMiddleware, async (req, res) => {
    try {
      const { reportType, reportedUserId, messageId, chatId, reason, details } = req.body || {};
      if (!reportType || !reason) {
        return res.status(400).json({ message: "reportType and reason are required" });
      }
      const allowed = ["user", "message", "chat"];
      if (!allowed.includes(reportType)) {
        return res.status(400).json({ message: "Invalid reportType" });
      }
      if (reportedUserId && reportedUserId === req.user.userId) {
        return res.status(400).json({ message: "You cannot report yourself" });
      }
      const report = await storage.createContentReport({
        reporterId: req.user.userId,
        reportedUserId: reportedUserId || null,
        messageId: messageId || null,
        chatId: chatId || null,
        reportType,
        reason: String(reason).slice(0, 50),
        details: details ? String(details).slice(0, 2e3) : null
      });
      console.log(`[safety] Report ${report.id} type=${reportType} reason=${reason} reporter=${req.user.userId}`);
      res.status(201).json({
        ok: true,
        reportId: report.id,
        message: "Thank you. Our team reviews reports within 24 hours."
      });
    } catch (error) {
      console.error("Content report error:", error);
      res.status(500).json({ message: "Failed to submit report" });
    }
  });
  app2.post("/api/chats/start-with-contact", authMiddleware, async (req, res) => {
    try {
      const userId = req.user.userId;
      const { userId: bodyUserId, lekkerNetworkId, phone } = req.body || {};
      let participantId = typeof bodyUserId === "string" ? bodyUserId : void 0;
      if (!participantId && typeof lekkerNetworkId === "string" && lekkerNetworkId.trim()) {
        const match = await storage.getUserByLekkerNetworkId(lekkerNetworkId.trim());
        participantId = match?.id;
      }
      if (!participantId && typeof phone === "string" && phone.trim()) {
        const cleanPhone = phone.replace(/\s/g, "");
        const match = await storage.getUserByPhone(cleanPhone);
        participantId = match?.id;
      }
      if (!participantId) {
        return res.status(404).json({
          message: "This person is not on Lekker Chat yet. Ask them to install the app and register with the same phone or email.",
          code: "USER_NOT_REGISTERED"
        });
      }
      const result = await resolveOrCreateP2PChat(userId, participantId);
      if ("error" in result && result.error) {
        return res.status(result.status).json({ message: result.error });
      }
      return res.status(result.status).json({ chat: result.chat });
    } catch (error) {
      console.error("Start-with-contact error:", error);
      res.status(500).json({ message: "Failed to start chat" });
    }
  });
  app2.post("/api/chats", authMiddleware, async (req, res) => {
    try {
      const { participantId, type, name } = req.body;
      const userId = req.user.userId;
      const chatType = type || "p2p";
      if (chatType === "p2p") {
        if (!participantId) {
          return res.status(400).json({ message: "participantId is required for P2P chat" });
        }
        const result = await resolveOrCreateP2PChat(userId, participantId);
        if ("error" in result && result.error) {
          return res.status(result.status).json({ message: result.error });
        }
        return res.status(result.status).json({ chat: result.chat });
      }
      if (chatType === "group") {
        const { participantIds } = req.body;
        if (!participantIds || !Array.isArray(participantIds) || participantIds.length < 1) {
          return res.status(400).json({ message: "At least one participant is required for group chat" });
        }
        const chat = await storage.createChat("group", userId, name || "Group Chat");
        await storage.addChatParticipant(chat.id, userId, "owner");
        for (const pid of participantIds) {
          if (pid !== userId) {
            await storage.addChatParticipant(chat.id, pid, "member");
          }
        }
        const participants = await enrichParticipants(chat.id);
        return res.status(201).json({ chat: { ...chat, participants } });
      }
      return res.status(400).json({ message: "Invalid chat type" });
    } catch (error) {
      console.error("Create chat error:", error);
      res.status(500).json({ message: "Failed to create chat" });
    }
  });
  app2.get("/api/chats", authMiddleware, async (req, res) => {
    try {
      const userId = req.user.userId;
      const chatList = await storage.getUserChats(userId);
      const enriched = [];
      for (const chat of chatList) {
        const participants = await enrichParticipants(chat.id);
        enriched.push({
          id: chat.id,
          type: chat.type,
          name: chat.name,
          createdAt: chat.createdAt,
          updatedAt: chat.updatedAt,
          participants,
          lastMessage: chat.lastMessage ? {
            id: chat.lastMessage.id,
            senderId: chat.lastMessage.senderId,
            content: chat.lastMessage.content,
            type: chat.lastMessage.type,
            status: chat.lastMessage.status,
            createdAt: chat.lastMessage.createdAt
          } : null,
          unreadCount: chat.unreadCount
        });
      }
      res.json({ chats: enriched });
    } catch (error) {
      console.error("Get chats error:", error);
      res.status(500).json({ message: "Failed to fetch chats" });
    }
  });
  app2.get("/api/chats/:chatId", authMiddleware, async (req, res) => {
    try {
      const { chatId } = req.params;
      const userId = req.user.userId;
      const isParticipant = await storage.isUserInChat(chatId, userId);
      if (!isParticipant) {
        return res.status(403).json({ message: "Access denied. You are not a participant in this chat." });
      }
      const chat = await storage.getChat(chatId);
      if (!chat) {
        return res.status(404).json({ message: "Chat not found" });
      }
      const participantUsers = await enrichParticipants(chatId);
      res.json({ chat: { ...chat, participants: participantUsers } });
    } catch (error) {
      console.error("Get chat error:", error);
      res.status(500).json({ message: "Failed to fetch chat" });
    }
  });
  app2.get("/api/chats/:chatId/messages", authMiddleware, async (req, res) => {
    try {
      const { chatId } = req.params;
      const userId = req.user.userId;
      const isParticipant = await storage.isUserInChat(chatId, userId);
      if (!isParticipant) {
        return res.status(403).json({ message: "Access denied. You are not a participant in this chat." });
      }
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
      const before = req.query.before;
      const messages = await storage.getChatMessages(chatId, limit, before);
      res.json({ messages });
    } catch (error) {
      console.error("Get messages error:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });
  app2.post("/api/chats/:chatId/messages", authMiddleware, async (req, res) => {
    try {
      const { chatId } = req.params;
      const userId = req.user.userId;
      const isParticipant = await storage.isUserInChat(chatId, userId);
      if (!isParticipant) {
        return res.status(403).json({ message: "Access denied. You are not a participant in this chat." });
      }
      const sender = await storage.getUser(userId);
      if (!sender?.phoneVerified || !sender?.emailVerified) {
        return res.status(403).json({
          message: "You must verify both your phone number and at least one email address before sending messages.",
          code: "UNVERIFIED"
        });
      }
      const { content, type, ...extras } = req.body;
      const msgType = type || "text";
      if (msgType === "text" && (!content || typeof content !== "string" || !content.trim())) {
        return res.status(400).json({ message: "Message content is required" });
      }
      if (rejectBlockedContent(
        res,
        msgType === "text" ? content : null,
        extras?.pollQuestion,
        extras?.sharedContactName
      )) {
        return;
      }
      const chatParticipantsList = await storage.getChatParticipants(chatId);
      for (const p of chatParticipantsList) {
        if (p.userId !== userId && await storage.isEitherUserBlocked(userId, p.userId)) {
          return res.status(403).json({
            message: "Messaging is not available with this user.",
            code: "BLOCKED"
          });
        }
      }
      const message = await storage.sendMessage(chatId, userId, content || null, msgType, extras);
      void notifyChatMessage(chatId, userId, message);
      const participants = await storage.getChatParticipants(chatId);
      for (const p of participants) {
        if (p.userId !== userId) {
          const otherUser = await storage.getUser(p.userId);
          if (otherUser?.autoReplyEnabled && otherUser.autoReplyMessage) {
            const autoReply = await storage.sendMessage(chatId, p.userId, otherUser.autoReplyMessage, "text");
            void notifyChatMessage(chatId, p.userId, autoReply);
          }
        }
      }
      res.status(201).json({ message });
    } catch (error) {
      console.error("Send message error:", error);
      res.status(500).json({ message: "Failed to send message" });
    }
  });
  app2.post("/api/chats/:chatId/read", authMiddleware, async (req, res) => {
    try {
      const { chatId } = req.params;
      const userId = req.user.userId;
      const isParticipant = await storage.isUserInChat(chatId, userId);
      if (!isParticipant) {
        return res.status(403).json({ message: "Access denied" });
      }
      await storage.markMessagesRead(chatId, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Mark read error:", error);
      res.status(500).json({ message: "Failed to mark messages as read" });
    }
  });
  app2.post("/api/chats/:chatId/messages/:messageId/poll-vote", authMiddleware, async (req, res) => {
    try {
      const { chatId, messageId } = req.params;
      const userId = req.user.userId;
      const { optionId } = req.body || {};
      if (!optionId || typeof optionId !== "string") {
        return res.status(400).json({ message: "optionId is required" });
      }
      const isParticipant = await storage.isUserInChat(chatId, userId);
      if (!isParticipant) {
        return res.status(403).json({ message: "Access denied" });
      }
      const [msg] = await db.select().from(chatMessages).where(
        and4(eq4(chatMessages.id, messageId), eq4(chatMessages.chatId, chatId))
      ).limit(1);
      if (!msg || msg.type !== "poll" || msg.isDeleted) {
        return res.status(404).json({ message: "Poll not found" });
      }
      let options = [];
      try {
        options = msg.pollOptions ? JSON.parse(msg.pollOptions) : [];
      } catch {
        return res.status(400).json({ message: "Invalid poll data" });
      }
      for (const opt of options) {
        opt.votes = (opt.votes || []).filter((v) => v !== userId);
      }
      const target = options.find((o) => o.id === optionId);
      if (!target) {
        return res.status(404).json({ message: "Poll option not found" });
      }
      target.votes = [...target.votes || [], userId];
      const [updated] = await db.update(chatMessages).set({ pollOptions: JSON.stringify(options) }).where(eq4(chatMessages.id, messageId)).returning();
      res.json({ message: updated });
    } catch (error) {
      console.error("Poll vote error:", error);
      res.status(500).json({ message: "Failed to record vote" });
    }
  });
  app2.put("/api/chats/:chatId/messages/:messageId", authMiddleware, async (req, res) => {
    try {
      const { chatId, messageId } = req.params;
      const userId = req.user.userId;
      const { content } = req.body;
      if (!content || typeof content !== "string" || content.trim().length === 0) {
        return res.status(400).json({ message: "Content is required" });
      }
      if (rejectBlockedContent(res, content)) {
        return;
      }
      const isParticipant = await storage.isUserInChat(chatId, userId);
      if (!isParticipant) {
        return res.status(403).json({ message: "Access denied" });
      }
      const [msg] = await db.select().from(chatMessages).where(
        and4(eq4(chatMessages.id, messageId), eq4(chatMessages.chatId, chatId))
      ).limit(1);
      if (!msg) {
        return res.status(404).json({ message: "Message not found" });
      }
      if (msg.senderId !== userId) {
        return res.status(403).json({ message: "You can only edit your own messages" });
      }
      if (msg.isDeleted) {
        return res.status(400).json({ message: "Cannot edit a deleted message" });
      }
      const [updated] = await db.update(chatMessages).set({ content: content.trim(), editedAt: /* @__PURE__ */ new Date() }).where(eq4(chatMessages.id, messageId)).returning();
      res.json({ message: updated });
    } catch (error) {
      console.error("Edit message error:", error);
      res.status(500).json({ message: "Failed to edit message" });
    }
  });
  app2.delete("/api/chats/:chatId/messages/:messageId", authMiddleware, async (req, res) => {
    try {
      const { chatId, messageId } = req.params;
      const userId = req.user.userId;
      const isParticipant = await storage.isUserInChat(chatId, userId);
      if (!isParticipant) {
        return res.status(403).json({ message: "Access denied" });
      }
      const [msg] = await db.select().from(chatMessages).where(
        and4(eq4(chatMessages.id, messageId), eq4(chatMessages.chatId, chatId))
      ).limit(1);
      if (!msg) {
        return res.status(404).json({ message: "Message not found" });
      }
      if (msg.senderId !== userId) {
        return res.status(403).json({ message: "You can only delete your own messages" });
      }
      const [updated] = await db.update(chatMessages).set({ isDeleted: true, content: null, imageUri: null, fileUri: null, audioUri: null }).where(eq4(chatMessages.id, messageId)).returning();
      res.json({ message: updated });
    } catch (error) {
      console.error("Delete message error:", error);
      res.status(500).json({ message: "Failed to delete message" });
    }
  });
  app2.delete("/api/chats/:chatId", authMiddleware, async (req, res) => {
    try {
      const { chatId } = req.params;
      const userId = req.user.userId;
      const isParticipant = await storage.isUserInChat(chatId, userId);
      if (!isParticipant) {
        return res.status(403).json({ message: "Access denied" });
      }
      await storage.deleteChat(chatId);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete chat error:", error);
      res.status(500).json({ message: "Failed to delete chat" });
    }
  });
  app2.get("/api/users/search", authMiddleware, async (req, res) => {
    try {
      const query = (req.query.q || "").trim().toLowerCase();
      if (query.length < 2) {
        return res.json({ users: [] });
      }
      const phoneVariants = [query];
      const digitsOnly = query.replace(/[^0-9]/g, "");
      if (digitsOnly.length >= 9) {
        if (query.startsWith("0") && digitsOnly.length === 10) {
          phoneVariants.push(`+27${digitsOnly.substring(1)}`);
          phoneVariants.push(`27${digitsOnly.substring(1)}`);
        } else if (query.startsWith("+27")) {
          phoneVariants.push(`0${digitsOnly.substring(2)}`);
        } else if (query.startsWith("27") && digitsOnly.length === 11) {
          phoneVariants.push(`+${query}`);
          phoneVariants.push(`0${digitsOnly.substring(2)}`);
        }
      }
      const userId = req.user.userId;
      const phoneConditions = phoneVariants.map(
        (variant) => sql4`${users.phone} LIKE ${`%${variant}%`}`
      );
      const emailMatchIds = await db.selectDistinct({ userId: userEmails.userId }).from(userEmails).where(sql4`LOWER(${userEmails.email}) LIKE ${`%${query}%`}`);
      const emailMatchUserIds = emailMatchIds.map((r) => r.userId).filter((id) => id !== userId);
      const results = await db.select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        username: users.username,
        avatarColor: users.avatarColor,
        profilePhoto: users.profilePhoto,
        isVerifiedLekkerpreneur: users.isVerifiedLekkerpreneur,
        businessName: users.businessName,
        presence: users.presence
      }).from(users).where(
        and4(
          ne2(users.id, userId),
          or3(
            sql4`LOWER(${users.firstName}) LIKE ${`%${query}%`}`,
            sql4`LOWER(${users.lastName}) LIKE ${`%${query}%`}`,
            sql4`LOWER(${users.username}) LIKE ${`%${query}%`}`,
            sql4`LOWER(${users.email}) LIKE ${`%${query}%`}`,
            ...emailMatchUserIds.length > 0 ? [sql4`${users.id} = ANY(ARRAY[${sql4.join(emailMatchUserIds.map((id) => sql4`${id}`), sql4`, `)}]::text[])`] : [],
            ...phoneConditions
          )
        )
      ).limit(20);
      res.json({ users: results });
    } catch (error) {
      console.error("User search error:", error);
      res.status(500).json({ message: "Failed to search users" });
    }
  });
  app2.get("/api/users/:userId", authMiddleware, async (req, res) => {
    try {
      const { userId } = req.params;
      const result = await db.select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        username: users.username,
        avatarColor: users.avatarColor,
        profilePhoto: users.profilePhoto,
        isVerifiedLekkerpreneur: users.isVerifiedLekkerpreneur,
        businessName: users.businessName,
        presence: users.presence,
        bio: users.bio,
        phone: users.phone,
        createdAt: users.createdAt
      }).from(users).where(eq4(users.id, userId)).limit(1);
      if (result.length === 0) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json({ user: result[0] });
    } catch (error) {
      console.error("Get user error:", error);
      res.status(500).json({ message: "Failed to get user" });
    }
  });
  const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1e3,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many upload attempts. Please try again later." },
    validate: { xForwardedForHeader: false }
  });
  app2.post("/api/objects/upload", authMiddleware, uploadLimiter, async (req, res) => {
    try {
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error("Upload URL generation error:", error);
      res.status(500).json({ message: "Failed to generate upload URL" });
    }
  });
  app2.post("/api/chat-attachments/finalize", authMiddleware, uploadLimiter, async (req, res) => {
    try {
      const { uploadedURL } = req.body;
      if (!uploadedURL || typeof uploadedURL !== "string") {
        return res.status(400).json({ message: "uploadedURL is required" });
      }
      const objectStorageService = new ObjectStorageService();
      const objectPath = await objectStorageService.trySetObjectEntityAclPolicy(
        uploadedURL,
        {
          owner: req.user.userId,
          visibility: "public"
        }
      );
      res.json({ objectPath });
    } catch (error) {
      console.error("Chat attachment finalize error:", error);
      res.status(500).json({ message: "Failed to finalize attachment" });
    }
  });
  app2.post("/api/user/profile-image", authMiddleware, uploadLimiter, async (req, res) => {
    try {
      const { imageURL } = req.body;
      if (!imageURL || typeof imageURL !== "string") {
        return res.status(400).json({ message: "imageURL is required" });
      }
      if (!imageURL.startsWith("https://") && !imageURL.startsWith("http://")) {
        return res.status(400).json({ message: "Invalid image URL" });
      }
      const objectStorageService = new ObjectStorageService();
      const objectPath = await objectStorageService.trySetObjectEntityAclPolicy(
        imageURL,
        {
          owner: req.user.userId,
          visibility: "public"
        }
      );
      const user = await storage.updateUser(req.user.userId, {
        profilePhoto: objectPath,
        profileImageUpdatedAt: /* @__PURE__ */ new Date()
      });
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      await storage.logAuthEvent("profile_image_update", req.user.userId, req.ip, req.headers["user-agent"]?.toString());
      res.json({ user: sanitizeUser(user) });
    } catch (error) {
      console.error("Profile image update error:", error);
      res.status(500).json({ message: "Failed to update profile image" });
    }
  });
  app2.delete("/api/user/profile-image", authMiddleware, async (req, res) => {
    try {
      const user = await storage.updateUser(req.user.userId, {
        profilePhoto: null,
        profileImageUpdatedAt: /* @__PURE__ */ new Date()
      });
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      await storage.logAuthEvent("profile_image_delete", req.user.userId, req.ip, req.headers["user-agent"]?.toString());
      res.json({ user: sanitizeUser(user) });
    } catch (error) {
      console.error("Profile image delete error:", error);
      res.status(500).json({ message: "Failed to remove profile image" });
    }
  });
  app2.get("/objects/*objectPath", async (req, res) => {
    const objectStorageService = new ObjectStorageService();
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      const canAccess = await objectStorageService.canAccessObjectEntity({
        objectFile,
        requestedPermission: "read" /* READ */
      });
      if (!canAccess) {
        return res.sendStatus(401);
      }
      objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        return res.sendStatus(404);
      }
      console.error("Object access error:", error);
      return res.sendStatus(500);
    }
  });
  app2.get("/public-objects/*filePath", async (req, res) => {
    const filePath = req.params.filePath;
    const objectStorageService = new ObjectStorageService();
    try {
      const file = await objectStorageService.searchPublicObject(filePath);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      objectStorageService.downloadObject(file, res);
    } catch (error) {
      console.error("Public object error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.get("/api/directory", async (req, res) => {
    const { serviceType, province, search, page, limit: limitParam, sort } = req.query;
    try {
      const apiResult = await fetchDirectory({
        page: page ? Number(page) : 1,
        limit: limitParam ? Math.min(Number(limitParam), 100) : 20,
        search: typeof search === "string" ? search : void 0,
        location: typeof province === "string" ? province : void 0,
        category: typeof serviceType === "string" ? serviceType : void 0,
        sort: typeof sort === "string" ? sort : void 0
      });
      if (apiResult?.success && apiResult.data) {
        const entries = apiResult.data.map((d) => buildDirectoryEntry(d));
        return res.json({
          entries,
          total: apiResult.total,
          page: apiResult.page,
          limit: apiResult.limit,
          filters: { serviceTypes: SERVICE_TYPES, provinces: PROVINCES },
          source: "lekker_network"
        });
      }
    } catch (e) {
      console.error("Lekker Network directory fetch error (falling back):", e);
    }
    let results = [...DIRECTORY_DATA];
    if (serviceType && typeof serviceType === "string") {
      results = results.filter((d) => d.serviceType === serviceType);
    }
    if (province && typeof province === "string") {
      results = results.filter((d) => d.province === province);
    }
    if (search && typeof search === "string") {
      const q = search.toLowerCase();
      results = results.filter(
        (d) => d.name.toLowerCase().includes(q) || d.businessName.toLowerCase().includes(q) || d.serviceType.toLowerCase().includes(q) || d.location.toLowerCase().includes(q)
      );
    }
    res.json({ entries: results, filters: { serviceTypes: SERVICE_TYPES, provinces: PROVINCES }, source: "fallback" });
  });
  app2.get("/api/directory/:id", async (req, res) => {
    try {
      const apiEntry = await fetchLekkerpreneurById(req.params.id);
      if (apiEntry) {
        return res.json({
          ...buildDirectoryEntry(apiEntry),
          source: "lekker_network"
        });
      }
    } catch (e) {
      console.error("Lekker Network directory/:id error (falling back):", e);
    }
    const entry = DIRECTORY_DATA.find((d) => d.id === req.params.id);
    if (!entry) return res.status(404).json({ error: "Not found" });
    res.json(entry);
  });
  app2.post("/api/verify-lekkerpreneur", async (req, res) => {
    const { phoneNumber } = req.body;
    if (!phoneNumber) {
      return res.status(400).json({ verified: false, error: "Phone number required" });
    }
    try {
      const match = await findLekkerpreneurByPhoneOrEmail(phoneNumber, "");
      if (match) {
        return res.json({
          verified: true,
          businessName: match.businessName || "Unknown Business",
          website: match.website || "",
          verifiedLinks: match.website ? [match.website] : [],
          name: match.ownerName || match.businessName || "Unknown",
          phone: match.phone || "",
          isVerified: match.isVerified ?? false,
          logoUrl: match.logoUrl || ""
        });
      }
    } catch (e) {
      console.error("Lekker Network verify error (falling back):", e);
    }
    const fallback = DIRECTORY_DATA.find((d) => d.phone === phoneNumber);
    if (fallback) {
      res.json({
        verified: true,
        businessName: fallback.businessName,
        website: fallback.website,
        verifiedLinks: [fallback.website],
        name: fallback.name,
        phone: fallback.phone
      });
    } else {
      res.json({ verified: false });
    }
  });
  app2.post("/api/verify-link", async (req, res) => {
    const { phoneNumber, link } = req.body;
    if (!phoneNumber || !link) {
      return res.status(400).json({ verified: false });
    }
    try {
      const match = await findLekkerpreneurByPhoneOrEmail(phoneNumber, "");
      if (match && match.website) {
        const linkDomain = new URL(link).hostname.replace("www.", "");
        const entryDomain = new URL(match.website).hostname.replace("www.", "");
        const isVerified = linkDomain === entryDomain;
        return res.json({ verified: isVerified, reason: isVerified ? void 0 : "Link does not match your verified business website" });
      }
    } catch (e) {
      console.error("Lekker Network verify-link error (falling back):", e);
    }
    const entry = DIRECTORY_DATA.find((d) => d.phone === phoneNumber);
    if (!entry) {
      return res.json({ verified: false, reason: "Not a verified Lekkerpreneur" });
    }
    try {
      const linkDomain = new URL(link).hostname.replace("www.", "");
      const entryDomain = new URL(entry.website).hostname.replace("www.", "");
      const isVerified = linkDomain === entryDomain;
      res.json({ verified: isVerified, reason: isVerified ? void 0 : "Link does not match your verified business website" });
    } catch {
      res.json({ verified: false, reason: "Invalid URL format" });
    }
  });
  const externalApiKeyAuth = (req, res, next) => {
    const apiKey = req.headers["x-api-key"];
    const expectedKey = process.env.LEKKER_NETWORK_API_KEY;
    if (!apiKey || !expectedKey || apiKey !== expectedKey) {
      return res.status(401).json({ success: false, message: "Invalid or missing API key" });
    }
    next();
  };
  app2.post("/api/v1/verify-user", externalApiKeyAuth, async (req, res) => {
    try {
      const { email, phone } = req.body;
      if (!email && !phone) {
        return res.status(400).json({
          success: false,
          matched: false,
          message: "At least one of 'email' or 'phone' is required."
        });
      }
      let user = null;
      if (email && typeof email === "string") {
        user = await storage.getUserByEmail(email.toLowerCase().trim());
      }
      if (!user && phone && typeof phone === "string") {
        const normalizedPhone = phone.replace(/[^\d+]/g, "");
        const phoneLookup = normalizedPhone.startsWith("0") && normalizedPhone.length === 10 ? "+27" + normalizedPhone.substring(1) : normalizedPhone.startsWith("+") ? normalizedPhone : "+" + normalizedPhone;
        user = await storage.getUserByPhone(phoneLookup);
      }
      if (!user) {
        return res.json({
          success: true,
          matched: false,
          message: "No matching Lekker Chat user found."
        });
      }
      if (!user.isVerifiedLekkerpreneur) {
        await storage.updateUser(user.id, {
          isVerifiedLekkerpreneur: true,
          lekkerVerifiedAt: /* @__PURE__ */ new Date()
        });
      }
      await storage.logAuthEvent("external_verify", user.id, req.ip, void 0, `Verified by Lekker Network via ${email ? "email" : "phone"}`);
      const updatedUser = await storage.getUser(user.id);
      const u = updatedUser || user;
      res.json({
        success: true,
        matched: true,
        user: {
          id: u.id,
          firstName: u.firstName,
          lastName: u.lastName,
          username: u.username,
          businessName: u.businessName,
          tradingName: u.tradingName,
          businessCategory: u.businessCategory,
          businessWebsite: u.businessWebsite,
          businessProvince: u.businessProvince,
          businessCountry: u.businessCountry,
          isVerifiedLekkerpreneur: u.isVerifiedLekkerpreneur,
          lekkerNetworkId: u.lekkerNetworkId,
          profilePhoto: u.profilePhoto,
          presence: u.presence,
          memberSince: u.createdAt
        }
      });
    } catch (error) {
      console.error("External verify-user error:", error);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  });
  app2.post("/api/auth/sync-lekker", authMiddleware, async (req, res) => {
    try {
      const user = await storage.getUser(req.user.userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const match = await findLekkerpreneurByPhoneOrEmail(user.phone, user.email);
      if (!match) {
        return res.json({ matched: false, message: "No matching Lekkerpreneur found for your phone or email." });
      }
      const profileData = extractLekkerpreneurProfile(match);
      let workspaceEmailActive = false;
      if (profileData.lekkerWorkspaceId) {
        const emailStatus = await fetchWorkspaceEmailStatus(profileData.lekkerWorkspaceId);
        workspaceEmailActive = emailStatus.active;
      }
      const updated = await storage.updateUser(user.id, { ...profileData, workspaceEmailActive });
      await storage.logAuthEvent("lekker_network_sync", user.id, req.ip, void 0, `Synced with: ${match.businessName} (${match.id})`);
      const syncUserData = buildSyncUserResponse(match);
      const sanitized = sanitizeUser(updated || user);
      res.json({
        matched: true,
        user: {
          ...sanitized,
          workspace: syncUserData.workspace
        }
      });
    } catch (error) {
      console.error("Lekker Network sync error:", error);
      res.status(500).json({ message: "Failed to sync with Lekker Network" });
    }
  });
  const networkLimiter = rateLimit({
    windowMs: 15 * 60 * 1e3,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: "Too many requests. Please try again later." },
    validate: { xForwardedForHeader: false }
  });
  app2.get("/api/v1/network", authMiddleware, networkLimiter, async (req, res) => {
    try {
      const requestingUser = await storage.getUser(req.user.userId);
      if (!requestingUser) {
        return res.status(404).json({ success: false, message: "User not found" });
      }
      if (!requestingUser.isVerifiedLekkerpreneur) {
        return res.status(403).json({
          success: false,
          message: "Access denied. Only verified Lekkerpreneurs can access the network."
        });
      }
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
      const { users: verifiedUsers, total } = await storage.getVerifiedUsers(requestingUser.id, page, limit);
      const safeUsers = verifiedUsers.map((u) => ({
        id: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        username: u.username,
        avatarColor: u.avatarColor,
        profilePhoto: u.profilePhoto,
        bio: u.bio,
        businessName: u.businessName,
        tradingName: u.tradingName,
        businessCategory: u.businessCategory,
        businessWebsite: u.businessWebsite,
        businessLogoUrl: u.businessLogoUrl,
        businessProvince: u.businessProvince,
        businessCountry: u.businessCountry,
        isVerifiedLekkerpreneur: u.isVerifiedLekkerpreneur,
        lekkerVerifiedAt: u.lekkerVerifiedAt,
        presence: u.presence,
        status: u.status,
        locationCity: u.locationCity,
        locationRegion: u.locationRegion
      }));
      res.json({
        success: true,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        data: safeUsers
      });
    } catch (error) {
      console.error("Network endpoint error:", error);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  });
  app2.post("/api/cledwyn/chat", authMiddleware, async (req, res) => {
    try {
      const { messages, lekkerNetworkAccess } = req.body;
      const userId = req.user.userId;
      const userProfile = await storage.getUser(userId);
      let workspaceContext = "";
      if (userProfile) {
        try {
          let wsDetail = null;
          if (userProfile.lekkerWorkspaceId) {
            wsDetail = await fetchWorkspaceById(userProfile.lekkerWorkspaceId);
          }
          if (wsDetail) {
            const parts = [];
            if (wsDetail.businessName) parts.push(`Business Name: ${wsDetail.businessName}`);
            if (wsDetail.tradingName) parts.push(`Trading Name: ${wsDetail.tradingName}`);
            if (wsDetail.workspaceName) parts.push(`Workspace Name: ${wsDetail.workspaceName}`);
            if (wsDetail.category) parts.push(`Company Type: ${wsDetail.category}`);
            if (wsDetail.address) parts.push(`Business Address: ${wsDetail.address}`);
            if (wsDetail.province) parts.push(`Province: ${wsDetail.province}`);
            if (wsDetail.phone) parts.push(`Business Phone: ${wsDetail.phone}`);
            if (wsDetail.email) parts.push(`Business Email: ${wsDetail.email}`);
            if (wsDetail.website) parts.push(`Website: ${wsDetail.website}`);
            parts.push(`Currency: ${wsDetail.currency || "ZAR"}`);
            if (wsDetail.isVatVendor) parts.push(`VAT Vendor: Yes (registered with SARS)`);
            if (wsDetail.financialYearEndMonth) parts.push(`Financial Year End: Month ${wsDetail.financialYearEndMonth}`);
            if (wsDetail.shippingEnabled) parts.push(`Shipping/Delivery: Enabled`);
            if (wsDetail.paymentUrl) parts.push(`Payment URL: ${wsDetail.paymentUrl}`);
            if (wsDetail.isVerified) parts.push(`CIPC Verified: Yes`);
            parts.push(`Plan: ${wsDetail.plan}`);
            parts.push(`Billing Status: ${wsDetail.billingStatus}`);
            if (wsDetail.teamSize) parts.push(`Team Size: ${wsDetail.teamSize} members`);
            if (wsDetail.activeServices?.length > 0) {
              parts.push(`Active Services: ${wsDetail.activeServices.map((s) => `${s.serviceType} (${s.status})`).join(", ")}`);
            }
            if (wsDetail.verifiedDomains?.length > 0) {
              parts.push(`Verified Domains: ${wsDetail.verifiedDomains.join(", ")}`);
            }
            workspaceContext = `

This user's Lekker Network workspace data:
${parts.join("\n")}`;
          } else if (userProfile.lekkerNetworkId) {
            const lekkerEntry = await fetchLekkerpreneurById(userProfile.lekkerNetworkId);
            if (lekkerEntry) {
              const parts = [];
              if (lekkerEntry.businessName) parts.push(`Business Name: ${lekkerEntry.businessName}`);
              if (lekkerEntry.ownerName) parts.push(`Owner: ${lekkerEntry.ownerName}`);
              if (lekkerEntry.category) parts.push(`Category: ${lekkerEntry.category}`);
              if (lekkerEntry.website) parts.push(`Website: ${lekkerEntry.website}`);
              if (lekkerEntry.location?.province) parts.push(`Province: ${lekkerEntry.location.province}`);
              if (lekkerEntry.isVerified) parts.push(`Verified: Yes`);
              if (parts.length > 0) {
                workspaceContext = `

This user's Lekker Network profile:
${parts.join("\n")}`;
              }
            }
          }
        } catch (e) {
          console.warn("Failed to fetch workspace data for CledwynAI context:", e);
        }
      }
      let userContext = "";
      if (userProfile) {
        const uParts = [];
        uParts.push(`Name: ${userProfile.firstName} ${userProfile.lastName}`);
        if (userProfile.businessName) uParts.push(`Business: ${userProfile.businessName}`);
        if (userProfile.tradingName) uParts.push(`Trading As: ${userProfile.tradingName}`);
        if (userProfile.businessCategory) uParts.push(`Category: ${userProfile.businessCategory}`);
        if (userProfile.businessProvince) uParts.push(`Province: ${userProfile.businessProvince}`);
        if (userProfile.businessCountry) uParts.push(`Country: ${userProfile.businessCountry}`);
        if (userProfile.isVerifiedLekkerpreneur) uParts.push(`Status: Verified Lekkerpreneur`);
        userContext = `

You are speaking with: ${uParts.join(", ")}`;
      }
      const basePrompt = lekkerNetworkAccess ? `You are CledwynAI, a smart and friendly AI business assistant for Lekker Network - a business platform for South African entrepreneurs (Lekkerpreneurs). You have access to this user's business workspace data and should use it to give personalized, contextual business advice. You help with business advice, product recommendations, service quotes, marketing strategies, invoicing guidance, VAT compliance, and general business operations. You are knowledgeable about the South African business landscape, professional yet approachable, and always aim to help entrepreneurs succeed. Keep responses concise and actionable. When asked about products or services, suggest checking the Lekker Marketplace. Use the workspace data to tailor your advice \u2014 reference their specific business name, industry, location, and financial setup when relevant.` : `You are CledwynAI, a helpful, friendly, and knowledgeable AI assistant. You can help with any topic \u2014 general knowledge, creative writing, coding, math, science, daily life tips, recommendations, and more. You are conversational, concise, and always aim to be useful. Keep your tone warm and approachable.`;
      const systemPrompt = basePrompt + userContext + workspaceContext;
      const systemMessage = {
        role: "system",
        content: systemPrompt
      };
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();
      const stream = await openrouter.chat.completions.create({
        model: "x-ai/grok-4.3",
        messages: [systemMessage, ...messages],
        stream: true,
        max_tokens: 8192
      });
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          res.write(`data: ${JSON.stringify({ content })}

`);
        }
      }
      res.write("data: [DONE]\n\n");
      res.end();
    } catch (error) {
      console.error("CledwynAI chat error:", error);
      if (res.headersSent) {
        res.write(
          `data: ${JSON.stringify({ error: "Something went wrong" })}

`
        );
        res.end();
      } else {
        res.status(500).json({ error: "Failed to process chat" });
      }
    }
  });
  app2.get("/api/lekker/session-token", authMiddleware, async (req, res) => {
    try {
      const user = await storage.getUser(req.user.userId);
      if (!user?.lekkerNetworkId) {
        return res.status(403).json({ message: "Lekkerpreneur account required" });
      }
      const token = await fetchMobileSessionToken(user.lekkerNetworkId);
      if (!token) {
        return res.status(502).json({ message: "Could not create session. Try again later." });
      }
      const base = process.env.LEKKER_API_BASE_URL || "https://lekker.network";
      res.json({
        token,
        url: `${base}/api/v1/mobile/establish-session?token=${encodeURIComponent(token)}`
      });
    } catch (e) {
      res.status(500).json({ message: "Session token failed" });
    }
  });
  app2.get("/api/lekker/email/status", authMiddleware, async (req, res) => {
    try {
      const user = await storage.getUser(req.user.userId);
      if (!user?.isVerifiedLekkerpreneur || !user.lekkerWorkspaceId) {
        return res.json({ active: false });
      }
      const status = await fetchWorkspaceEmailStatus(user.lekkerWorkspaceId);
      if (status.active !== user.workspaceEmailActive) {
        await storage.updateUser(user.id, { workspaceEmailActive: status.active });
      }
      res.json(status);
    } catch (e) {
      res.status(500).json({ message: "Email status failed" });
    }
  });
  app2.get("/api/lekker/email/threads", authMiddleware, async (req, res) => {
    try {
      const user = await storage.getUser(req.user.userId);
      if (!user?.lekkerWorkspaceId || !user.workspaceEmailActive) {
        return res.status(403).json({ message: "Workspace email not active" });
      }
      const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
      const data = await fetchMobileEmailThreads(user.lekkerWorkspaceId, page);
      res.json(data || { threads: [] });
    } catch (e) {
      res.status(500).json({ message: "Failed to load inbox" });
    }
  });
  app2.get("/api/lekker/email/threads/:threadId", authMiddleware, async (req, res) => {
    try {
      const user = await storage.getUser(req.user.userId);
      if (!user?.lekkerWorkspaceId || !user.workspaceEmailActive) {
        return res.status(403).json({ message: "Workspace email not active" });
      }
      const data = await fetchMobileEmailThread(user.lekkerWorkspaceId, req.params.threadId);
      if (!data) return res.status(404).json({ message: "Thread not found" });
      res.json(data);
    } catch (e) {
      res.status(500).json({ message: "Failed to load thread" });
    }
  });
  app2.post("/api/lekker/email/send", authMiddleware, async (req, res) => {
    try {
      const user = await storage.getUser(req.user.userId);
      if (!user?.lekkerWorkspaceId || !user.workspaceEmailActive || !user.lekkerNetworkId) {
        return res.status(403).json({ message: "Workspace email not active" });
      }
      const { to, subject, bodyText, inReplyTo, references } = req.body || {};
      if (!to || !subject || !bodyText) {
        return res.status(400).json({ message: "to, subject, and bodyText are required" });
      }
      const result = await sendMobileEmail(user.lekkerWorkspaceId, user.lekkerNetworkId, {
        to,
        subject,
        bodyText,
        inReplyTo,
        references
      });
      if (!result) return res.status(502).json({ message: "Could not send email" });
      res.json({ success: true, ...result });
    } catch (e) {
      res.status(500).json({ message: e?.message || "Failed to send email" });
    }
  });
  app2.get("/api/feed", authMiddleware, async (req, res) => {
    try {
      const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
      const authorId = typeof req.query.authorId === "string" ? req.query.authorId : void 0;
      const posts = await listFeedPosts({
        viewerId: req.user.userId,
        authorId,
        page
      });
      res.json({ posts });
    } catch (e) {
      res.status(500).json({ message: "Failed to load feed" });
    }
  });
  app2.get("/api/feed/:id", authMiddleware, async (req, res) => {
    try {
      const post = await getFeedPostById(req.params.id);
      if (!post) return res.status(404).json({ message: "Post not found" });
      res.json({ post });
    } catch (e) {
      res.status(500).json({ message: "Failed to load post" });
    }
  });
  app2.post("/api/feed", authMiddleware, async (req, res) => {
    try {
      const { content, mediaUrl } = req.body || {};
      if (!String(content || "").trim() && !mediaUrl) {
        return res.status(400).json({ message: "Post content or media is required" });
      }
      if (rejectBlockedContent(res, String(content || ""))) {
        return;
      }
      const result = await createFeedPost({
        authorId: req.user.userId,
        content: String(content || "").trim() || "\u{1F4F8}",
        mediaUrl: mediaUrl || null
      });
      if (result === "duplicate") {
        return res.status(409).json({
          duplicate: true,
          message: "You've already posted similar content in the last 24 hours."
        });
      }
      res.status(201).json({ post: result });
    } catch (e) {
      res.status(500).json({ message: "Failed to create post" });
    }
  });
  app2.post("/api/feed/:id/like", authMiddleware, async (req, res) => {
    try {
      await toggleFeedLike(req.params.id, req.user.userId);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: "Failed to update like" });
    }
  });
  app2.post("/api/feed/:id/share", authMiddleware, async (req, res) => {
    try {
      await addFeedShare(req.params.id, req.user.userId);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: "Failed to share post" });
    }
  });
  app2.post("/api/feed/:id/comments", authMiddleware, async (req, res) => {
    try {
      const content = String(req.body?.content || "").trim();
      if (!content) return res.status(400).json({ message: "Comment is required" });
      if (rejectBlockedContent(res, content)) {
        return;
      }
      await addFeedComment({
        postId: req.params.id,
        authorId: req.user.userId,
        content
      });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: "Failed to add comment" });
    }
  });
  app2.post("/api/push/register", authMiddleware, async (req, res) => {
    try {
      const { expoPushToken, platform } = req.body || {};
      if (!expoPushToken || typeof expoPushToken !== "string") {
        return res.status(400).json({ message: "expoPushToken is required" });
      }
      if (!expoPushToken.startsWith("ExponentPushToken") && !expoPushToken.startsWith("ExpoPushToken")) {
        return res.status(400).json({ message: "Invalid Expo push token" });
      }
      await registerPushToken(req.user.userId, expoPushToken, platform);
      res.json({ ok: true });
    } catch (e) {
      console.error("Push register error:", e);
      res.status(500).json({ message: "Failed to register push token" });
    }
  });
  app2.delete("/api/push/register", authMiddleware, async (req, res) => {
    try {
      const expoPushToken = typeof req.body?.expoPushToken === "string" ? req.body.expoPushToken : void 0;
      await unregisterPushToken(req.user.userId, expoPushToken);
      res.json({ ok: true });
    } catch (e) {
      console.error("Push unregister error:", e);
      res.status(500).json({ message: "Failed to unregister push token" });
    }
  });
  function connectUnavailable(res) {
    return res.status(503).json({
      message: "Connect API not configured. Set LEKKER_WORKSPACE_ID and LEKKER_TOKEN."
    });
  }
  app2.get("/api/connect/feed", authMiddleware, async (req, res) => {
    if (!isConnectConfigured()) return connectUnavailable(res);
    try {
      const params = {};
      for (const [key, value] of Object.entries(req.query)) {
        if (typeof value === "string") params[key] = value;
      }
      const data = await getFeed(params);
      res.json(data);
    } catch (e) {
      console.error("Connect feed error:", e);
      res.status(502).json({ message: e?.message || "Connect feed failed" });
    }
  });
  app2.post("/api/connect/contacts", authMiddleware, async (req, res) => {
    if (!isConnectConfigured()) return connectUnavailable(res);
    try {
      const { name, email, phone, message, sourceUrl } = req.body || {};
      if (!name || typeof name !== "string") {
        return res.status(400).json({ message: "name is required" });
      }
      const data = await submitContactToLekker({ name, email, phone, message, sourceUrl });
      res.json(data);
    } catch (e) {
      console.error("Connect contact error:", e);
      res.status(502).json({ message: e?.message || "Contact submission failed" });
    }
  });
  app2.get("/api/connect/products/search", authMiddleware, async (req, res) => {
    if (!isConnectConfigured()) return connectUnavailable(res);
    try {
      const params = {};
      for (const [key, value] of Object.entries(req.query)) {
        if (typeof value === "string") params[key] = value;
      }
      const data = await searchProducts(params);
      res.json(data);
    } catch (e) {
      console.error("Connect product search error:", e);
      res.status(502).json({ message: e?.message || "Product search failed" });
    }
  });
  app2.post("/api/connect/orders", authMiddleware, async (req, res) => {
    if (!isConnectConfigured()) return connectUnavailable(res);
    try {
      const data = await submitOrder(req.body);
      res.json(data);
    } catch (e) {
      console.error("Connect order error:", e);
      res.status(502).json({ message: e?.message || "Order submission failed" });
    }
  });
  app2.post("/api/connect/checkout", authMiddleware, async (req, res) => {
    if (!isConnectConfigured()) return connectUnavailable(res);
    try {
      const data = await createCheckout(req.body);
      res.json(data);
    } catch (e) {
      console.error("Connect checkout error:", e);
      res.status(502).json({ message: e?.message || "Checkout failed" });
    }
  });
  app2.post("/api/connect/shipping/quote", authMiddleware, async (req, res) => {
    if (!isConnectConfigured()) return connectUnavailable(res);
    try {
      const data = await getShippingQuote(req.body);
      res.json(data);
    } catch (e) {
      console.error("Connect shipping quote error:", e);
      res.status(502).json({ message: e?.message || "Shipping quote failed" });
    }
  });
  app2.get("/api/connect/gift-cards/validate", authMiddleware, async (req, res) => {
    if (!isConnectConfigured()) return connectUnavailable(res);
    try {
      const code = String(req.query.code || "");
      if (!code) return res.status(400).json({ message: "code is required" });
      const data = await validateGiftCard(code);
      res.json(data);
    } catch (e) {
      console.error("Connect gift card error:", e);
      res.status(502).json({ message: e?.message || "Gift card validation failed" });
    }
  });
  app2.post("/api/connect/portal/request-otp", authMiddleware, async (req, res) => {
    if (!isConnectConfigured()) return connectUnavailable(res);
    try {
      const { email, phone, channel } = req.body || {};
      if (!channel || channel !== "email" && channel !== "whatsapp") {
        return res.status(400).json({ message: "channel must be email or whatsapp" });
      }
      const data = await requestPortalOtp({ email, phone, channel });
      res.json(data);
    } catch (e) {
      console.error("Connect portal OTP request error:", e);
      res.status(502).json({ message: e?.message || "Portal OTP request failed" });
    }
  });
  app2.post("/api/connect/portal/verify-otp", authMiddleware, async (req, res) => {
    if (!isConnectConfigured()) return connectUnavailable(res);
    try {
      const { email, phone, code } = req.body || {};
      if (!code) return res.status(400).json({ message: "code is required" });
      const data = await verifyPortalOtp({ email, phone, code });
      res.json(data);
    } catch (e) {
      console.error("Connect portal OTP verify error:", e);
      res.status(502).json({ message: e?.message || "Portal OTP verification failed" });
    }
  });
  app2.get("/api/connect/portal/me", authMiddleware, async (req, res) => {
    if (!isConnectConfigured()) return connectUnavailable(res);
    try {
      const sessionToken = req.headers["x-portal-token"];
      if (!sessionToken || typeof sessionToken !== "string") {
        return res.status(400).json({ message: "X-Portal-Token header is required" });
      }
      const data = await getPortalMe(sessionToken);
      res.json(data);
    } catch (e) {
      console.error("Connect portal me error:", e);
      res.status(502).json({ message: e?.message || "Portal session failed" });
    }
  });
  const httpServer = createServer(app2);
  return httpServer;
}

// server/index.ts
import * as fs from "fs";
import * as path from "path";
process.on("uncaughtException", (err) => {
  console.error("[Process] Uncaught exception (server will continue):", err.message);
});
process.on("unhandledRejection", (reason) => {
  console.error("[Process] Unhandled promise rejection (server will continue):", reason);
});
var app = express();
var log = console.log;
function setupCors(app2) {
  app2.use((req, res, next) => {
    const origins = /* @__PURE__ */ new Set();
    if (process.env.REPLIT_DEV_DOMAIN) {
      origins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
    }
    if (process.env.REPLIT_DOMAINS) {
      process.env.REPLIT_DOMAINS.split(",").forEach((d) => {
        origins.add(`https://${d.trim()}`);
      });
    }
    const origin = req.header("origin");
    const isLocalhost = origin?.startsWith("http://localhost:") || origin?.startsWith("http://127.0.0.1:");
    if (origin && (origins.has(origin) || isLocalhost)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS"
      );
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.header("Access-Control-Allow-Credentials", "true");
    }
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });
}
function setupBodyParsing(app2) {
  app2.use(
    express.json({
      limit: "10mb",
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      }
    })
  );
  app2.use(express.urlencoded({ extended: false }));
}
function setupRequestLogging(app2) {
  app2.use((req, res, next) => {
    const start = Date.now();
    const path2 = req.path;
    let capturedJsonResponse = void 0;
    const originalResJson = res.json;
    res.json = function(bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };
    res.on("finish", () => {
      if (!path2.startsWith("/api")) return;
      const duration = Date.now() - start;
      const queryStr = Object.keys(req.query).length > 0 ? `?${new URLSearchParams(req.query).toString()}` : "";
      let logLine = `${req.method} ${path2}${queryStr} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "\u2026";
      }
      log(logLine);
    });
    next();
  });
}
function getAppName() {
  try {
    const appJsonPath = path.resolve(process.cwd(), "app.json");
    const appJsonContent = fs.readFileSync(appJsonPath, "utf-8");
    const appJson = JSON.parse(appJsonContent);
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}
function serveExpoManifest(platform, res) {
  const manifestPath = path.resolve(
    process.cwd(),
    "static-build",
    platform,
    "manifest.json"
  );
  if (!fs.existsSync(manifestPath)) {
    return res.status(404).json({ error: `Manifest not found for platform: ${platform}` });
  }
  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");
  const manifest = fs.readFileSync(manifestPath, "utf-8");
  res.send(manifest);
}
function serveLandingPage({
  req,
  res,
  landingPageTemplate,
  appName
}) {
  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto || req.protocol || "https";
  const forwardedHost = req.header("x-forwarded-host");
  const host = forwardedHost || req.get("host");
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;
  log(`baseUrl`, baseUrl);
  log(`expsUrl`, expsUrl);
  const html = landingPageTemplate.replace(/BASE_URL_PLACEHOLDER/g, baseUrl).replace(/EXPS_URL_PLACEHOLDER/g, expsUrl).replace(/APP_NAME_PLACEHOLDER/g, appName);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}
function configureExpoAndLanding(app2) {
  const templatePath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "landing-page.html"
  );
  const landingPageTemplate = fs.readFileSync(templatePath, "utf-8");
  const appName = getAppName();
  log("Serving static Expo files with dynamic manifest routing");
  app2.use((req, res, next) => {
    if (req.path.startsWith("/api")) {
      return next();
    }
    if (req.path !== "/" && req.path !== "/manifest") {
      return next();
    }
    const platform = req.header("expo-platform");
    if (platform && (platform === "ios" || platform === "android")) {
      return serveExpoManifest(platform, res);
    }
    if (req.path === "/") {
      return serveLandingPage({
        req,
        res,
        landingPageTemplate,
        appName
      });
    }
    next();
  });
  app2.use("/assets", express.static(path.resolve(process.cwd(), "assets")));
  app2.use(express.static(path.resolve(process.cwd(), "static-build")));
  log("Expo routing: Checking expo-platform header on / and /manifest");
}
function setupErrorHandler(app2) {
  app2.use((err, _req, res, next) => {
    const error = err;
    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";
    console.error("Internal Server Error:", err);
    if (res.headersSent) {
      return next(err);
    }
    return res.status(status).json({ message });
  });
}
(async () => {
  app.use(compression());
  setupCors(app);
  setupBodyParsing(app);
  setupRequestLogging(app);
  configureExpoAndLanding(app);
  const server = await registerRoutes(app);
  setupErrorHandler(app);
  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true
    },
    () => {
      log(`express server serving on port ${port}`);
    }
  );
})();
