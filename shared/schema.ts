import { sql } from "drizzle-orm";
import { pgTable, text, varchar, boolean, timestamp, integer, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  phone: varchar("phone", { length: 20 }).notNull().unique(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  username: varchar("username", { length: 50 }).notNull().unique(),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  passwordHash: text("password_hash").notNull(),
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
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_users_verified").on(table.isVerifiedLekkerpreneur),
]);

export const authAuditLogs = pgTable("auth_audit_logs", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }),
  event: varchar("event", { length: 50 }).notNull(),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  details: text("details"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const phoneVerificationCodes = pgTable("phone_verification_codes", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  phone: varchar("phone", { length: 20 }).notNull(),
  code: varchar("code", { length: 6 }).notNull(),
  verified: boolean("verified").default(false).notNull(),
  used: boolean("used").default(false).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const emailVerificationCodes = pgTable("email_verification_codes", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  email: varchar("email", { length: 255 }).notNull(),
  code: varchar("code", { length: 6 }).notNull(),
  verified: boolean("verified").default(false).notNull(),
  used: boolean("used").default(false).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const passwordResetCodes = pgTable("password_reset_codes", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  code: varchar("code", { length: 6 }).notNull(),
  used: boolean("used").default(false).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const chats = pgTable("chats", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  type: varchar("type", { length: 10 }).notNull().default("p2p"),
  name: varchar("name", { length: 255 }),
  createdBy: varchar("created_by", { length: 36 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const chatParticipants = pgTable("chat_participants", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  chatId: varchar("chat_id", { length: 36 }).notNull(),
  userId: varchar("user_id", { length: 36 }).notNull(),
  role: varchar("role", { length: 20 }).notNull().default("member"),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
  lastReadAt: timestamp("last_read_at"),
}, (table) => [
  uniqueIndex("idx_chat_participant_unique").on(table.chatId, table.userId),
  index("idx_chat_participants_user").on(table.userId),
  index("idx_chat_participants_chat").on(table.chatId),
]);

export const chatMessages = pgTable("chat_messages", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_chat_messages_chat").on(table.chatId),
  index("idx_chat_messages_chat_created").on(table.chatId, table.createdAt),
  index("idx_chat_messages_sender").on(table.senderId),
]);

export const passwordSchema = z.string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[0-9]/, "Password must contain at least one number")
  .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character");

export const registerSchema = z.object({
  phone: z.string().min(6, "Phone number is required").max(20),
  email: z.string().email("Invalid email address"),
  username: z.string().min(3, "Username must be at least 3 characters").max(50)
    .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores"),
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().min(1, "Last name is required").max(100),
  password: passwordSchema,
});

export const loginSchema = z.object({
  identifier: z.string().min(1, "Email or phone number is required"),
  password: z.string().min(1, "Password is required"),
});

export const updateProfileSchema = z.object({
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
  locationRegion: z.string().max(100).nullable().optional(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type AuthAuditLog = typeof authAuditLogs.$inferSelect;
export type PhoneVerificationCode = typeof phoneVerificationCodes.$inferSelect;
export type EmailVerificationCode = typeof emailVerificationCodes.$inferSelect;
export type PasswordResetCode = typeof passwordResetCodes.$inferSelect;
export type Chat = typeof chats.$inferSelect;
export type ChatParticipant = typeof chatParticipants.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
