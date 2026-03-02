import { drizzle } from "drizzle-orm/node-postgres";
import { eq, or, and, ne, sql, asc, desc, count } from "drizzle-orm";
import { users, authAuditLogs, type User, type InsertUser } from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

export const db = drizzle(process.env.DATABASE_URL);

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByPhone(phone: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByIdentifier(identifier: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User | undefined>;
  getVerifiedUsers(excludeId: string, page: number, limit: number): Promise<{ users: User[]; total: number }>;
  logAuthEvent(event: string, userId?: string, ipAddress?: string, userAgent?: string, details?: string): Promise<void>;
}

class PgStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
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

  async getUserByIdentifier(identifier: string): Promise<User | undefined> {
    const normalized = identifier.toLowerCase();
    const [user] = await db.select().from(users).where(
      or(
        eq(users.email, normalized),
        eq(users.phone, identifier),
        eq(users.username, normalized)
      )
    ).limit(1);
    return user;
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
}

export const storage = new PgStorage();
