import { sql } from "drizzle-orm";
import { pgTable, text, varchar, boolean, timestamp, integer } from "drizzle-orm/pg-core";
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

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
  bio: z.string().max(500).optional(),
  businessName: z.string().max(255).optional(),
  status: z.string().max(200).optional(),
  presence: z.enum(["online", "away", "dnd", "offline"]).optional(),
  avatarColor: z.string().max(10).optional(),
  profilePhoto: z.string().optional(),
  autoReplyEnabled: z.boolean().optional(),
  autoReplyMessage: z.string().max(500).optional(),
  notificationsEnabled: z.boolean().optional(),
  locationEnabled: z.boolean().optional(),
  lastLatitude: z.string().optional(),
  lastLongitude: z.string().optional(),
  locationCity: z.string().max(100).optional(),
  locationRegion: z.string().max(100).optional(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type AuthAuditLog = typeof authAuditLogs.$inferSelect;
