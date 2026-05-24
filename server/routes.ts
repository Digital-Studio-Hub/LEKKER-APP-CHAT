import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import OpenAI from "openai";
import rateLimit, { type Options } from "express-rate-limit";
import { registerSchema, loginSchema, updateProfileSchema, users, chatMessages, passwordResetCodes, phoneVerificationCodes, emailVerificationCodes } from "@shared/schema";
import { storage, db } from "./storage";
import { sql, or, and, ne, eq } from "drizzle-orm";
import {
  hashPassword,
  verifyPassword,
  generateToken,
  authMiddleware,
  optionalAuthMiddleware,
  type AuthenticatedRequest,
} from "./auth";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { ObjectPermission } from "./objectAcl";
import { findLekkerpreneurByPhoneOrEmail, fetchDirectory as fetchLekkerDirectory, fetchLekkerpreneurById, fetchWorkspaceById, fetchWorkspaces, extractLekkerpreneurProfile, buildSyncUserResponse, buildDirectoryEntry, buildWorkspaceDirectoryEntry, type LekkerNetworkEntry, type WorkspaceDetail } from "./lekkerNetwork";
import { sendPasswordResetEmail, sendEmailVerificationEmail } from "./gmail";
import { sendPasswordResetSMS, sendPhoneVerificationSMS } from "./twilio";

async function enrichParticipants(chatId: string) {
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
        presence: u.presence,
      });
    }
  }
  return participantUsers;
}

const openrouter = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY,
});

interface DirectoryEntry {
  id: string;
  name: string;
  businessName: string;
  serviceType: string;
  location: string;
  province: string;
  phone: string;
  bio: string;
  avatarColor: string;
  website: string;
}

const DIRECTORY_DATA: DirectoryEntry[] = [
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
  { id: "d15", name: "Themba Mokoena", businessName: "Mokoena Properties", serviceType: "Real Estate", location: "East London", province: "Eastern Cape", phone: "+27821015015", bio: "Property sales, rentals, valuations, and investment advisory.", avatarColor: "#F7DC6F", website: "https://mokoenaproperties.co.za" },
];

const SERVICE_TYPES = [...new Set(DIRECTORY_DATA.map((d) => d.serviceType))].sort();
const PROVINCES = [...new Set(DIRECTORY_DATA.map((d) => d.province))].sort();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many login attempts. Please try again in 15 minutes." },
  validate: { xForwardedForHeader: false },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many registration attempts. Please try again later." },
  validate: { xForwardedForHeader: false },
});

function sanitizeUser(user: any) {
  const { passwordHash, ...safe } = user;
  return safe;
}

const phoneVerifyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many verification attempts. Please try again in an hour." },
  validate: { xForwardedForHeader: false },
});

export async function registerRoutes(app: Express): Promise<Server> {

  app.post("/api/auth/send-phone-code", phoneVerifyLimiter, async (req: Request, res: Response) => {
    try {
      const { phone } = req.body;
      if (!phone || phone.length < 6) {
        return res.status(400).json({ message: "Valid phone number is required" });
      }

      const existingUser = await storage.getUserByPhone(phone.trim());
      if (existingUser) {
        return res.status(409).json({ message: "An account with this phone number already exists", field: "phone" });
      }

      await db.delete(phoneVerificationCodes).where(eq(phoneVerificationCodes.phone, phone.trim()));

      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      await db.insert(phoneVerificationCodes).values({
        phone: phone.trim(),
        code,
        verified: false,
        used: false,
        expiresAt,
      });

      await sendPhoneVerificationSMS(phone.trim(), code);

      res.json({ message: "Verification code sent to your phone" });
    } catch (err) {
      console.error("Send phone code error:", err);
      res.status(500).json({ message: "Failed to send verification code. Please try again." });
    }
  });

  app.post("/api/auth/send-email-code", phoneVerifyLimiter, async (req: Request, res: Response) => {
    try {
      const { email, firstName } = req.body;
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ message: "Valid email address is required" });
      }

      const existingUser = await storage.getUserByEmail(email.trim().toLowerCase());
      if (existingUser) {
        return res.status(409).json({ message: "An account with this email already exists", field: "email" });
      }

      await db.delete(emailVerificationCodes).where(eq(emailVerificationCodes.email, email.trim().toLowerCase()));

      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      await db.insert(emailVerificationCodes).values({
        email: email.trim().toLowerCase(),
        code,
        verified: false,
        used: false,
        expiresAt,
      });

      await sendEmailVerificationEmail(email.trim().toLowerCase(), code, firstName || "there");

      res.json({ message: "Verification code sent to your email" });
    } catch (err) {
      console.error("Send email code error:", err);
      res.status(500).json({ message: "Failed to send email verification code. Please try again." });
    }
  });

  app.post("/api/auth/verify-email-code", phoneVerifyLimiter, async (req: Request, res: Response) => {
    try {
      const { email, code } = req.body;
      if (!email || !code) {
        return res.status(400).json({ message: "Email and code are required" });
      }

      const [record] = await db
        .select()
        .from(emailVerificationCodes)
        .where(eq(emailVerificationCodes.email, email.trim().toLowerCase()))
        .orderBy(emailVerificationCodes.createdAt)
        .limit(1);

      if (!record) {
        return res.status(400).json({ message: "No verification code found. Please request a new code." });
      }
      if (record.used) {
        return res.status(400).json({ message: "This code has already been used. Please request a new code." });
      }
      if (new Date() > record.expiresAt) {
        return res.status(400).json({ message: "This code has expired. Please request a new code." });
      }
      if (record.code !== code.trim()) {
        return res.status(400).json({ message: "Incorrect code. Please try again." });
      }

      await db
        .update(emailVerificationCodes)
        .set({ verified: true })
        .where(eq(emailVerificationCodes.id, record.id));

      res.json({ verified: true, emailVerificationId: record.id });
    } catch (err) {
      console.error("Verify email code error:", err);
      res.status(500).json({ message: "Verification failed. Please try again." });
    }
  });

  app.post("/api/auth/verify-phone-code", phoneVerifyLimiter, async (req: Request, res: Response) => {
    try {
      const { phone, code } = req.body;
      if (!phone || !code) {
        return res.status(400).json({ message: "Phone number and code are required" });
      }

      const [record] = await db
        .select()
        .from(phoneVerificationCodes)
        .where(eq(phoneVerificationCodes.phone, phone.trim()))
        .orderBy(phoneVerificationCodes.createdAt)
        .limit(1);

      if (!record) {
        return res.status(400).json({ message: "No verification code found. Please request a new code." });
      }
      if (record.used) {
        return res.status(400).json({ message: "This code has already been used. Please request a new code." });
      }
      if (new Date() > record.expiresAt) {
        return res.status(400).json({ message: "This code has expired. Please request a new code." });
      }
      if (record.code !== code.trim()) {
        return res.status(400).json({ message: "Incorrect code. Please try again." });
      }

      await db
        .update(phoneVerificationCodes)
        .set({ verified: true })
        .where(eq(phoneVerificationCodes.id, record.id));

      res.json({ verified: true, verificationId: record.id });
    } catch (err) {
      console.error("Verify phone code error:", err);
      res.status(500).json({ message: "Verification failed. Please try again." });
    }
  });

  app.post("/api/auth/register", registerLimiter, async (req: Request, res: Response) => {
    try {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        const errors = parsed.error.errors.map(e => ({ field: e.path.join("."), message: e.message }));
        return res.status(400).json({ message: "Validation failed", errors });
      }

      const { phone, email, username, firstName, lastName, password } = parsed.data;
      const { verificationId, emailVerificationId } = req.body;

      if (!verificationId) {
        return res.status(400).json({ message: "Phone verification is required", field: "phone" });
      }
      if (!emailVerificationId) {
        return res.status(400).json({ message: "Email verification is required", field: "email" });
      }

      const [[phoneRecord], [emailRecord]] = await Promise.all([
        db.select().from(phoneVerificationCodes).where(eq(phoneVerificationCodes.id, verificationId)).limit(1),
        db.select().from(emailVerificationCodes).where(eq(emailVerificationCodes.id, emailVerificationId)).limit(1),
      ]);

      if (!phoneRecord || !phoneRecord.verified || phoneRecord.used) {
        return res.status(400).json({ message: "Invalid or expired phone verification. Please verify your number again.", field: "phone" });
      }
      if (phoneRecord.phone !== phone.trim()) {
        return res.status(400).json({ message: "Phone number does not match verified number.", field: "phone" });
      }
      if (new Date() > phoneRecord.expiresAt) {
        return res.status(400).json({ message: "Phone verification has expired. Please verify your number again.", field: "phone" });
      }

      if (!emailRecord || !emailRecord.verified || emailRecord.used) {
        return res.status(400).json({ message: "Invalid or expired email verification. Please verify your email again.", field: "email" });
      }
      if (emailRecord.email !== email.trim().toLowerCase()) {
        return res.status(400).json({ message: "Email does not match verified email.", field: "email" });
      }
      if (new Date() > emailRecord.expiresAt) {
        return res.status(400).json({ message: "Email verification has expired. Please verify your email again.", field: "email" });
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

      await Promise.all([
        db.update(phoneVerificationCodes).set({ used: true }).where(eq(phoneVerificationCodes.id, verificationId)),
        db.update(emailVerificationCodes).set({ used: true }).where(eq(emailVerificationCodes.id, emailVerificationId)),
      ]);

      const passwordHash = await hashPassword(password);

      const AVATAR_COLORS = ["#4ECDC4", "#FF6B6B", "#45B7D1", "#96CEB4", "#FFEAA7", "#DDA0DD", "#85C1E9", "#F7DC6F", "#BB8FCE", "#98D8C8"];
      const randomColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];

      const user = await storage.createUser({
        phone,
        email,
        username,
        firstName,
        lastName,
        passwordHash,
        avatarColor: randomColor,
        role: "user",
        emailVerified: false,
        phoneVerified: true,
        lekkerNetworkAccess: false,
        autoReplyEnabled: false,
        notificationsEnabled: true,
        locationEnabled: false,
        presence: "online",
      });

      const token = generateToken({ userId: user.id, email: user.email, role: user.role });

      await storage.logAuthEvent("register", user.id, req.ip, req.headers["user-agent"]?.toString());

      let finalUser = user;
      try {
        const lekkerMatch = await findLekkerpreneurByPhoneOrEmail(phone, email);
        if (lekkerMatch) {
          const profileData = extractLekkerpreneurProfile(lekkerMatch);
          const updated = await storage.updateUser(user.id, profileData);
          if (updated) finalUser = updated;
          await storage.logAuthEvent("lekker_network_match", user.id, req.ip, undefined, `Matched Lekkerpreneur: ${lekkerMatch.businessName} (${lekkerMatch.id})`);
        }
      } catch (e) {
        console.error("Lekker Network lookup on register (non-fatal):", e);
      }

      res.status(201).json({ user: sanitizeUser(finalUser), token });
    } catch (error: any) {
      console.error("Registration error:", error);
      if (error?.code === "23505") {
        return res.status(409).json({ message: "An account with these details already exists" });
      }
      res.status(500).json({ message: "Registration failed. Please try again." });
    }
  });

  app.post("/api/auth/login", loginLimiter, async (req: Request, res: Response) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Please provide your email/phone and password" });
      }

      const { identifier, password } = parsed.data;

      const user = await storage.getUserByIdentifier(identifier);
      if (!user) {
        await storage.logAuthEvent("login_failed", undefined, req.ip, req.headers["user-agent"]?.toString(), `identifier: ${identifier}`);
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
            await storage.logAuthEvent("lekker_network_match", user.id, req.ip, undefined, `Matched Lekkerpreneur: ${lekkerMatch.businessName} (${lekkerMatch.id})`);
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
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many reset requests. Please try again later." },
    validate: { xForwardedForHeader: false },
  });

  app.post("/api/auth/forgot-password", resetRequestLimiter, async (req: Request, res: Response) => {
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

      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      await db.insert(passwordResetCodes).values({
        userId: user.id,
        email: user.email,
        code,
        used: false,
        expiresAt,
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

  async function resolveIdentifierToEmail(identifier: string): Promise<string | null> {
    const trimmed = identifier.trim().toLowerCase();
    const isPhone = /^\+?\d[\d\s-]{5,}$/.test(trimmed);
    if (isPhone) {
      const cleanPhone = trimmed.replace(/[\s-]/g, "");
      const user = await storage.getUserByPhone(cleanPhone);
      return user?.email || null;
    }
    return trimmed;
  }

  app.post("/api/auth/verify-reset-code", resetRequestLimiter, async (req: Request, res: Response) => {
    try {
      const { email, code } = req.body;
      if (!email || !code) {
        return res.status(400).json({ message: "Email or phone and code are required" });
      }

      const resolvedEmail = await resolveIdentifierToEmail(email);
      if (!resolvedEmail) {
        return res.status(400).json({ message: "Invalid or expired reset code" });
      }

      const resetCodes = await db
        .select()
        .from(passwordResetCodes)
        .where(
          and(
            eq(passwordResetCodes.email, resolvedEmail),
            eq(passwordResetCodes.code, code.trim()),
            eq(passwordResetCodes.used, false)
          )
        )
        .orderBy(sql`created_at DESC`)
        .limit(1);

      if (resetCodes.length === 0) {
        return res.status(400).json({ message: "Invalid or expired reset code" });
      }

      const resetCode = resetCodes[0];
      if (new Date() > resetCode.expiresAt) {
        return res.status(400).json({ message: "Reset code has expired. Please request a new one." });
      }

      res.json({ valid: true, message: "Code verified successfully" });
    } catch (error) {
      console.error("Verify reset code error:", error);
      res.status(500).json({ message: "Something went wrong. Please try again." });
    }
  });

  app.post("/api/auth/reset-password", resetRequestLimiter, async (req: Request, res: Response) => {
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

      const resetCodes = await db
        .select()
        .from(passwordResetCodes)
        .where(
          and(
            eq(passwordResetCodes.email, resolvedEmail),
            eq(passwordResetCodes.code, code.trim()),
            eq(passwordResetCodes.used, false)
          )
        )
        .orderBy(sql`created_at DESC`)
        .limit(1);

      if (resetCodes.length === 0) {
        return res.status(400).json({ message: "Invalid or expired reset code" });
      }

      const resetCode = resetCodes[0];
      if (new Date() > resetCode.expiresAt) {
        return res.status(400).json({ message: "Reset code has expired. Please request a new one." });
      }

      const newHash = await hashPassword(newPassword);
      await storage.updateUser(resetCode.userId, { passwordHash: newHash } as any);

      await db
        .update(passwordResetCodes)
        .set({ used: true })
        .where(eq(passwordResetCodes.id, resetCode.id));

      await storage.logAuthEvent("password_reset_success", resetCode.userId, req.ip, req.headers["user-agent"]?.toString());

      res.json({ message: "Password has been reset successfully. You can now sign in." });
    } catch (error) {
      console.error("Reset password error:", error);
      res.status(500).json({ message: "Something went wrong. Please try again." });
    }
  });

  app.get("/api/auth/me", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = await storage.getUser(req.user!.userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json({ user: sanitizeUser(user) });
    } catch (error) {
      console.error("Get profile error:", error);
      res.status(500).json({ message: "Failed to fetch profile" });
    }
  });

  app.put("/api/auth/profile", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const parsed = updateProfileSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid profile data" });
      }

      if (parsed.data.username) {
        const existing = await storage.getUserByUsername(parsed.data.username.toLowerCase());
        if (existing && existing.id !== req.user!.userId) {
          return res.status(409).json({ message: "Username is already taken" });
        }
        parsed.data.username = parsed.data.username.toLowerCase();
      }

      const user = await storage.updateUser(req.user!.userId, parsed.data);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({ user: sanitizeUser(user) });
    } catch (error) {
      console.error("Update profile error:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  app.post("/api/auth/logout", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    await storage.logAuthEvent("logout", req.user!.userId, req.ip, req.headers["user-agent"]?.toString());
    res.json({ message: "Logged out successfully" });
  });

  app.delete("/api/auth/account", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      await storage.logAuthEvent("account_deleted", userId, req.ip, req.headers["user-agent"]?.toString());
      await storage.deleteUserAccount(userId);
      res.json({ message: "Account deleted successfully" });
    } catch (err) {
      console.error("Account deletion error:", err);
      res.status(500).json({ message: "Failed to delete account. Please try again." });
    }
  });

  app.post("/api/chats", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { participantId, type, name } = req.body;
      const userId = req.user!.userId;
      const chatType = type || "p2p";

      if (chatType === "p2p") {
        if (!participantId) {
          return res.status(400).json({ message: "participantId is required for P2P chat" });
        }
        if (participantId === userId) {
          return res.status(400).json({ message: "Cannot create chat with yourself" });
        }
        const otherUser = await storage.getUser(participantId);
        if (!otherUser) {
          return res.status(404).json({ message: "User not found" });
        }
        const existing = await storage.findExistingP2PChat(userId, participantId);
        if (existing) {
          const participants = await enrichParticipants(existing.id);
          return res.json({ chat: { ...existing, participants } });
        }
        const chat = await storage.createChat("p2p", userId);
        await storage.addChatParticipant(chat.id, userId, "owner");
        await storage.addChatParticipant(chat.id, participantId, "member");
        const participants = await enrichParticipants(chat.id);
        return res.status(201).json({ chat: { ...chat, participants } });
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

  app.get("/api/chats", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
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
            createdAt: chat.lastMessage.createdAt,
          } : null,
          unreadCount: chat.unreadCount,
        });
      }

      res.json({ chats: enriched });
    } catch (error) {
      console.error("Get chats error:", error);
      res.status(500).json({ message: "Failed to fetch chats" });
    }
  });

  app.get("/api/chats/:chatId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { chatId } = req.params;
      const userId = req.user!.userId;

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

  app.get("/api/chats/:chatId/messages", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { chatId } = req.params;
      const userId = req.user!.userId;

      const isParticipant = await storage.isUserInChat(chatId, userId);
      if (!isParticipant) {
        return res.status(403).json({ message: "Access denied. You are not a participant in this chat." });
      }

      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
      const before = req.query.before as string | undefined;

      const messages = await storage.getChatMessages(chatId, limit, before);
      res.json({ messages });
    } catch (error) {
      console.error("Get messages error:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  app.post("/api/chats/:chatId/messages", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { chatId } = req.params;
      const userId = req.user!.userId;

      const isParticipant = await storage.isUserInChat(chatId, userId);
      if (!isParticipant) {
        return res.status(403).json({ message: "Access denied. You are not a participant in this chat." });
      }

      const { content, type, ...extras } = req.body;
      const msgType = type || "text";

      if (msgType === "text" && (!content || typeof content !== "string" || !content.trim())) {
        return res.status(400).json({ message: "Message content is required" });
      }

      const message = await storage.sendMessage(chatId, userId, content || null, msgType, extras);

      const participants = await storage.getChatParticipants(chatId);
      for (const p of participants) {
        if (p.userId !== userId) {
          const otherUser = await storage.getUser(p.userId);
          if (otherUser?.autoReplyEnabled && otherUser.autoReplyMessage) {
            await storage.sendMessage(chatId, p.userId, otherUser.autoReplyMessage, "text");
          }
        }
      }

      res.status(201).json({ message });
    } catch (error) {
      console.error("Send message error:", error);
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  app.post("/api/chats/:chatId/read", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { chatId } = req.params;
      const userId = req.user!.userId;

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

  app.put("/api/chats/:chatId/messages/:messageId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { chatId, messageId } = req.params;
      const userId = req.user!.userId;
      const { content } = req.body;

      if (!content || typeof content !== "string" || content.trim().length === 0) {
        return res.status(400).json({ message: "Content is required" });
      }

      const isParticipant = await storage.isUserInChat(chatId, userId);
      if (!isParticipant) {
        return res.status(403).json({ message: "Access denied" });
      }

      const [msg] = await db.select().from(chatMessages).where(
        and(eq(chatMessages.id, messageId), eq(chatMessages.chatId, chatId))
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

      const [updated] = await db.update(chatMessages)
        .set({ content: content.trim(), editedAt: new Date() })
        .where(eq(chatMessages.id, messageId))
        .returning();

      res.json({ message: updated });
    } catch (error) {
      console.error("Edit message error:", error);
      res.status(500).json({ message: "Failed to edit message" });
    }
  });

  app.delete("/api/chats/:chatId/messages/:messageId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { chatId, messageId } = req.params;
      const userId = req.user!.userId;

      const isParticipant = await storage.isUserInChat(chatId, userId);
      if (!isParticipant) {
        return res.status(403).json({ message: "Access denied" });
      }

      const [msg] = await db.select().from(chatMessages).where(
        and(eq(chatMessages.id, messageId), eq(chatMessages.chatId, chatId))
      ).limit(1);

      if (!msg) {
        return res.status(404).json({ message: "Message not found" });
      }
      if (msg.senderId !== userId) {
        return res.status(403).json({ message: "You can only delete your own messages" });
      }

      const [updated] = await db.update(chatMessages)
        .set({ isDeleted: true, content: null, imageUri: null, fileUri: null, audioUri: null })
        .where(eq(chatMessages.id, messageId))
        .returning();

      res.json({ message: updated });
    } catch (error) {
      console.error("Delete message error:", error);
      res.status(500).json({ message: "Failed to delete message" });
    }
  });

  app.delete("/api/chats/:chatId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { chatId } = req.params;
      const userId = req.user!.userId;

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

  app.get("/api/users/search", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const query = (req.query.q as string || "").trim().toLowerCase();
      if (query.length < 2) {
        return res.json({ users: [] });
      }

      const phoneVariants: string[] = [query];
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

      const userId = req.user!.userId;
      const phoneConditions = phoneVariants.map(
        (variant) => sql`${users.phone} LIKE ${`%${variant}%`}`
      );

      const results = await db.select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        username: users.username,
        avatarColor: users.avatarColor,
        profilePhoto: users.profilePhoto,
        isVerifiedLekkerpreneur: users.isVerifiedLekkerpreneur,
        businessName: users.businessName,
        presence: users.presence,
      }).from(users).where(
        and(
          ne(users.id, userId),
          or(
            sql`LOWER(${users.firstName}) LIKE ${`%${query}%`}`,
            sql`LOWER(${users.lastName}) LIKE ${`%${query}%`}`,
            sql`LOWER(${users.username}) LIKE ${`%${query}%`}`,
            sql`LOWER(${users.email}) LIKE ${`%${query}%`}`,
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

  app.get("/api/users/:userId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
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
        createdAt: users.createdAt,
      }).from(users).where(eq(users.id, userId)).limit(1);

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
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many upload attempts. Please try again later." },
    validate: { xForwardedForHeader: false },
  });

  app.post("/api/objects/upload", authMiddleware, uploadLimiter, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error("Upload URL generation error:", error);
      res.status(500).json({ message: "Failed to generate upload URL" });
    }
  });

  app.post("/api/chat-attachments/finalize", authMiddleware, uploadLimiter, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { uploadedURL } = req.body;
      if (!uploadedURL || typeof uploadedURL !== "string") {
        return res.status(400).json({ message: "uploadedURL is required" });
      }
      const objectStorageService = new ObjectStorageService();
      const objectPath = await objectStorageService.trySetObjectEntityAclPolicy(
        uploadedURL,
        {
          owner: req.user!.userId,
          visibility: "public",
        },
      );
      res.json({ objectPath });
    } catch (error) {
      console.error("Chat attachment finalize error:", error);
      res.status(500).json({ message: "Failed to finalize attachment" });
    }
  });

  app.post("/api/user/profile-image", authMiddleware, uploadLimiter, async (req: AuthenticatedRequest, res: Response) => {
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
          owner: req.user!.userId,
          visibility: "public",
        },
      );

      const user = await storage.updateUser(req.user!.userId, {
        profilePhoto: objectPath,
        profileImageUpdatedAt: new Date(),
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      await storage.logAuthEvent("profile_image_update", req.user!.userId, req.ip, req.headers["user-agent"]?.toString());

      res.json({ user: sanitizeUser(user) });
    } catch (error) {
      console.error("Profile image update error:", error);
      res.status(500).json({ message: "Failed to update profile image" });
    }
  });

  app.delete("/api/user/profile-image", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = await storage.updateUser(req.user!.userId, {
        profilePhoto: null,
        profileImageUpdatedAt: new Date(),
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      await storage.logAuthEvent("profile_image_delete", req.user!.userId, req.ip, req.headers["user-agent"]?.toString());

      res.json({ user: sanitizeUser(user) });
    } catch (error) {
      console.error("Profile image delete error:", error);
      res.status(500).json({ message: "Failed to remove profile image" });
    }
  });

  app.get("/objects/*objectPath", async (req: Request, res: Response) => {
    const objectStorageService = new ObjectStorageService();
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      const canAccess = await objectStorageService.canAccessObjectEntity({
        objectFile,
        requestedPermission: ObjectPermission.READ,
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

  app.get("/public-objects/*filePath", async (req: Request, res: Response) => {
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

  app.get("/api/directory", async (req: Request, res: Response) => {
    const { serviceType, province, search, page, limit: limitParam, sort } = req.query;

    try {
      const apiResult = await fetchLekkerDirectory({
        page: page ? Number(page) : 1,
        limit: limitParam ? Math.min(Number(limitParam), 100) : 20,
        search: typeof search === "string" ? search : undefined,
        location: typeof province === "string" ? province : undefined,
        category: typeof serviceType === "string" ? serviceType : undefined,
        sort: typeof sort === "string" ? sort : undefined,
      });

      if (apiResult?.success && apiResult.data) {
        const entries = apiResult.data.map((d) => buildDirectoryEntry(d));

        return res.json({
          entries,
          total: apiResult.total,
          page: apiResult.page,
          limit: apiResult.limit,
          filters: { serviceTypes: SERVICE_TYPES, provinces: PROVINCES },
          source: "lekker_network",
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
        (d) =>
          d.name.toLowerCase().includes(q) ||
          d.businessName.toLowerCase().includes(q) ||
          d.serviceType.toLowerCase().includes(q) ||
          d.location.toLowerCase().includes(q),
      );
    }
    res.json({ entries: results, filters: { serviceTypes: SERVICE_TYPES, provinces: PROVINCES }, source: "fallback" });
  });

  app.get("/api/directory/:id", async (req: Request, res: Response) => {
    try {
      const apiEntry = await fetchLekkerpreneurById(req.params.id);
      if (apiEntry) {
        return res.json({
          ...buildDirectoryEntry(apiEntry),
          source: "lekker_network",
        });
      }
    } catch (e) {
      console.error("Lekker Network directory/:id error (falling back):", e);
    }

    const entry = DIRECTORY_DATA.find((d) => d.id === req.params.id);
    if (!entry) return res.status(404).json({ error: "Not found" });
    res.json(entry);
  });

  app.post("/api/verify-lekkerpreneur", async (req: Request, res: Response) => {
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
          logoUrl: match.logoUrl || "",
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
        phone: fallback.phone,
      });
    } else {
      res.json({ verified: false });
    }
  });

  app.post("/api/verify-link", async (req: Request, res: Response) => {
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
        return res.json({ verified: isVerified, reason: isVerified ? undefined : "Link does not match your verified business website" });
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
      res.json({ verified: isVerified, reason: isVerified ? undefined : "Link does not match your verified business website" });
    } catch {
      res.json({ verified: false, reason: "Invalid URL format" });
    }
  });

  const externalApiKeyAuth = (req: Request, res: Response, next: Function) => {
    const apiKey = req.headers["x-api-key"] as string;
    const expectedKey = process.env.LEKKER_NETWORK_API_KEY;
    if (!apiKey || !expectedKey || apiKey !== expectedKey) {
      return res.status(401).json({ success: false, message: "Invalid or missing API key" });
    }
    next();
  };

  app.post("/api/v1/verify-user", externalApiKeyAuth, async (req: Request, res: Response) => {
    try {
      const { email, phone } = req.body;

      if (!email && !phone) {
        return res.status(400).json({
          success: false,
          matched: false,
          message: "At least one of 'email' or 'phone' is required.",
        });
      }

      let user = null;

      if (email && typeof email === "string") {
        user = await storage.getUserByEmail(email.toLowerCase().trim());
      }

      if (!user && phone && typeof phone === "string") {
        const normalizedPhone = phone.replace(/[^\d+]/g, "");
        const phoneLookup = normalizedPhone.startsWith("0") && normalizedPhone.length === 10
          ? "+27" + normalizedPhone.substring(1)
          : normalizedPhone.startsWith("+") ? normalizedPhone : "+" + normalizedPhone;
        user = await storage.getUserByPhone(phoneLookup);
      }

      if (!user) {
        return res.json({
          success: true,
          matched: false,
          message: "No matching Lekker Chat user found.",
        });
      }

      if (!user.isVerifiedLekkerpreneur) {
        await storage.updateUser(user.id, {
          isVerifiedLekkerpreneur: true,
          lekkerVerifiedAt: new Date(),
        });
      }

      await storage.logAuthEvent("external_verify", user.id, req.ip, undefined, `Verified by Lekker Network via ${email ? "email" : "phone"}`);

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
          memberSince: u.createdAt,
        },
      });
    } catch (error) {
      console.error("External verify-user error:", error);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  });

  app.post("/api/auth/sync-lekker", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = await storage.getUser(req.user!.userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const match = await findLekkerpreneurByPhoneOrEmail(user.phone, user.email);
      if (!match) {
        return res.json({ matched: false, message: "No matching Lekkerpreneur found for your phone or email." });
      }

      const profileData = extractLekkerpreneurProfile(match);
      const updated = await storage.updateUser(user.id, profileData);

      await storage.logAuthEvent("lekker_network_sync", user.id, req.ip, undefined, `Synced with: ${match.businessName} (${match.id})`);

      const syncUserData = buildSyncUserResponse(match);
      const sanitized = sanitizeUser(updated || user);

      res.json({
        matched: true,
        user: {
          ...sanitized,
          workspace: syncUserData.workspace,
        },
      });
    } catch (error) {
      console.error("Lekker Network sync error:", error);
      res.status(500).json({ message: "Failed to sync with Lekker Network" });
    }
  });

  const networkLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: "Too many requests. Please try again later." },
    validate: { xForwardedForHeader: false } as Partial<Options>,
  });

  app.get("/api/v1/network", authMiddleware, networkLimiter, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const requestingUser = await storage.getUser(req.user!.userId);
      if (!requestingUser) {
        return res.status(404).json({ success: false, message: "User not found" });
      }

      if (!requestingUser.isVerifiedLekkerpreneur) {
        return res.status(403).json({
          success: false,
          message: "Access denied. Only verified Lekkerpreneurs can access the network.",
        });
      }

      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));

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
        locationRegion: u.locationRegion,
      }));

      res.json({
        success: true,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        data: safeUsers,
      });
    } catch (error) {
      console.error("Network endpoint error:", error);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  });

  app.post("/api/cledwyn/chat", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { messages, lekkerNetworkAccess } = req.body;
      const userId = req.user!.userId;

      const userProfile = await storage.getUser(userId);

      let workspaceContext = "";
      if (userProfile) {
        try {
          let wsDetail: WorkspaceDetail | null = null;

          if (userProfile.lekkerWorkspaceId) {
            wsDetail = await fetchWorkspaceById(userProfile.lekkerWorkspaceId);
          }

          if (wsDetail) {
            const parts: string[] = [];
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
              parts.push(`Active Services: ${wsDetail.activeServices.map(s => `${s.serviceType} (${s.status})`).join(", ")}`);
            }
            if (wsDetail.verifiedDomains?.length > 0) {
              parts.push(`Verified Domains: ${wsDetail.verifiedDomains.join(", ")}`);
            }
            workspaceContext = `\n\nThis user's Lekker Network workspace data:\n${parts.join("\n")}`;
          } else if (userProfile.lekkerNetworkId) {
            const lekkerEntry = await fetchLekkerpreneurById(userProfile.lekkerNetworkId);
            if (lekkerEntry) {
              const parts: string[] = [];
              if (lekkerEntry.businessName) parts.push(`Business Name: ${lekkerEntry.businessName}`);
              if (lekkerEntry.ownerName) parts.push(`Owner: ${lekkerEntry.ownerName}`);
              if (lekkerEntry.category) parts.push(`Category: ${lekkerEntry.category}`);
              if (lekkerEntry.website) parts.push(`Website: ${lekkerEntry.website}`);
              if (lekkerEntry.location?.province) parts.push(`Province: ${lekkerEntry.location.province}`);
              if (lekkerEntry.isVerified) parts.push(`Verified: Yes`);
              if (parts.length > 0) {
                workspaceContext = `\n\nThis user's Lekker Network profile:\n${parts.join("\n")}`;
              }
            }
          }
        } catch (e) {
          console.warn("Failed to fetch workspace data for CledwynAI context:", e);
        }
      }

      let userContext = "";
      if (userProfile) {
        const uParts: string[] = [];
        uParts.push(`Name: ${userProfile.firstName} ${userProfile.lastName}`);
        if (userProfile.businessName) uParts.push(`Business: ${userProfile.businessName}`);
        if (userProfile.tradingName) uParts.push(`Trading As: ${userProfile.tradingName}`);
        if (userProfile.businessCategory) uParts.push(`Category: ${userProfile.businessCategory}`);
        if (userProfile.businessProvince) uParts.push(`Province: ${userProfile.businessProvince}`);
        if (userProfile.businessCountry) uParts.push(`Country: ${userProfile.businessCountry}`);
        if (userProfile.isVerifiedLekkerpreneur) uParts.push(`Status: Verified Lekkerpreneur`);
        userContext = `\n\nYou are speaking with: ${uParts.join(", ")}`;
      }

      const basePrompt = lekkerNetworkAccess
        ? `You are CledwynAI, a smart and friendly AI business assistant for Lekker Network - a business platform for South African entrepreneurs (Lekkerpreneurs). You have access to this user's business workspace data and should use it to give personalized, contextual business advice. You help with business advice, product recommendations, service quotes, marketing strategies, invoicing guidance, VAT compliance, and general business operations. You are knowledgeable about the South African business landscape, professional yet approachable, and always aim to help entrepreneurs succeed. Keep responses concise and actionable. When asked about products or services, suggest checking the Lekker Marketplace. Use the workspace data to tailor your advice — reference their specific business name, industry, location, and financial setup when relevant.`
        : `You are CledwynAI, a helpful, friendly, and knowledgeable AI assistant. You can help with any topic — general knowledge, creative writing, coding, math, science, daily life tips, recommendations, and more. You are conversational, concise, and always aim to be useful. Keep your tone warm and approachable.`;

      const systemPrompt = basePrompt + userContext + workspaceContext;

      const systemMessage = {
        role: "system" as const,
        content: systemPrompt,
      };

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      const stream = await openrouter.chat.completions.create({
        model: "x-ai/grok-3-mini",
        messages: [systemMessage, ...messages],
        stream: true,
        max_tokens: 8192,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
        }
      }

      res.write("data: [DONE]\n\n");
      res.end();
    } catch (error) {
      console.error("CledwynAI chat error:", error);
      if (res.headersSent) {
        res.write(
          `data: ${JSON.stringify({ error: "Something went wrong" })}\n\n`,
        );
        res.end();
      } else {
        res.status(500).json({ error: "Failed to process chat" });
      }
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
