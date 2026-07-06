import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import OpenAI from "openai";
import rateLimit, { type Options } from "express-rate-limit";
import { registerSchema, loginSchema, updateProfileSchema, users, chatMessages, passwordResetCodes, phoneVerificationCodes, emailVerificationCodes, userEmails } from "@shared/schema";
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
import {
  findLekkerpreneurByPhoneOrEmail,
  fetchDirectory as fetchLekkerDirectory,
  fetchLekkerpreneurById,
  fetchWorkspaceById,
  fetchWorkspaces,
  extractLekkerpreneurProfile,
  buildSyncUserResponse,
  buildDirectoryEntry,
  buildWorkspaceDirectoryEntry,
  fetchMobileSessionToken,
  fetchWorkspaceEmailStatus,
  fetchMobileEmailThreads,
  fetchMobileEmailThread,
  sendMobileEmail,
  type LekkerNetworkEntry,
  type WorkspaceDetail,
} from "./lekkerNetwork";
import { sendPasswordResetEmail, sendEmailVerificationEmail } from "./gmail";
import { sendPasswordResetSMS, sendPhoneVerificationSMS } from "./twilio";
import { sendWhatsAppOtp } from "./whatsapp-otp";
import {
  listFeedPosts,
  getFeedPostById,
  createFeedPost,
  toggleFeedLike,
  addFeedShare,
  addFeedComment,
} from "./feed";
import { registerPushToken, unregisterPushToken, notifyChatMessage } from "./push";
import { containsBlockedContent, CONTENT_FILTER_MESSAGE } from "./content-filter";
import {
  isConnectConfigured,
  submitContactToLekker,
  getFeed as getConnectFeed,
  searchProducts,
  submitOrder,
  createCheckout,
  getShippingQuote,
  validateGiftCard,
  requestPortalOtp,
  verifyPortalOtp,
  getPortalMe,
} from "./lekker-connect";
import { normaliseMobile, phoneToPlaceholderEmail, phoneToUsername } from "../shared/mobile-utils";
import type { User } from "@shared/schema";

function rejectBlockedContent(res: Response, ...texts: Array<string | null | undefined>): boolean {
  for (const text of texts) {
    if (text && containsBlockedContent(text)) {
      res.status(400).json({ message: CONTENT_FILTER_MESSAGE, code: "CONTENT_BLOCKED" });
      return true;
    }
  }
  return false;
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/[\s\-().]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("0")) return "+27" + digits.slice(1);
  if (digits.startsWith("27")) return "+" + digits;
  if (digits.length >= 7) return "+27" + digits;
  return digits;
}

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

const AVATAR_COLORS = ["#4ECDC4", "#FF6B6B", "#45B7D1", "#96CEB4", "#FFEAA7", "#DDA0DD", "#85C1E9", "#F7DC6F", "#BB8FCE", "#98D8C8"];

async function applyLekkerSync(user: User, req: Request): Promise<User> {
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
        workspaceEmailActive,
      });
      if (updated) {
        finalUser = updated;
        await storage.logAuthEvent(
          "lekker_network_match",
          user.id,
          req.ip,
          undefined,
          `Matched Lekkerpreneur: ${lekkerMatch.businessName} (${lekkerMatch.id})`,
        );
      }
    }
  } catch (e) {
    console.error("Lekker Network sync (non-fatal):", e);
  }
  return finalUser;
}

async function resolveUniqueUsername(phone: string): Promise<string> {
  let base = phoneToUsername(phone);
  let candidate = base;
  let n = 0;
  while (await storage.getUserByUsername(candidate)) {
    n += 1;
    candidate = `${base}_${n}`;
  }
  return candidate;
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
      const rawPhone = req.body.phone;
      if (!rawPhone || rawPhone.trim().length < 6) {
        return res.status(400).json({ message: "Valid phone number is required" });
      }
      const phone = normalizePhone(rawPhone.trim());

      const existingUser = await storage.getUserByPhone(phone);
      if (existingUser) {
        return res.status(409).json({ message: "An account with this phone number already exists", field: "phone" });
      }

      await db.delete(phoneVerificationCodes).where(eq(phoneVerificationCodes.phone, phone));

      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      await db.insert(phoneVerificationCodes).values({
        phone,
        code,
        verified: false,
        used: false,
        expiresAt,
      });

      await sendPhoneVerificationSMS(phone, code);

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
      const { code } = req.body;
      const phone = req.body.phone ? normalizePhone(req.body.phone.trim()) : "";
      if (!phone || !code) {
        return res.status(400).json({ message: "Phone number and code are required" });
      }

      const [record] = await db
        .select()
        .from(phoneVerificationCodes)
        .where(eq(phoneVerificationCodes.phone, phone))
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

  /** WhatsApp OTP — passwordless login & registration (Guideline synergy with lekker.network) */
  app.post("/api/auth/whatsapp/send-code", phoneVerifyLimiter, async (req: Request, res: Response) => {
    try {
      const rawPhone = req.body.phone;
      if (!rawPhone || String(rawPhone).trim().length < 6) {
        return res.status(400).json({ message: "Valid phone number is required" });
      }
      const phone = normaliseMobile(String(rawPhone).trim());
      if (!phone) {
        return res.status(400).json({ message: "Could not parse phone number" });
      }

      await db.delete(phoneVerificationCodes).where(eq(phoneVerificationCodes.phone, phone));

      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      await db.insert(phoneVerificationCodes).values({
        phone,
        code,
        verified: false,
        used: false,
        expiresAt,
      });

      await sendWhatsAppOtp(phone, code);

      const existing = await storage.getUserByPhone(phone);
      res.json({
        message: "Verification code sent via WhatsApp",
        isExistingUser: !!existing,
      });
    } catch (err) {
      console.error("WhatsApp send-code error:", err);
      res.status(500).json({ message: "Failed to send WhatsApp code. Please try again." });
    }
  });

  app.post("/api/auth/whatsapp/verify", phoneVerifyLimiter, async (req: Request, res: Response) => {
    try {
      const { code, displayName } = req.body;
      const phone = req.body.phone ? normaliseMobile(String(req.body.phone).trim()) : null;
      if (!phone || !code) {
        return res.status(400).json({ message: "Phone number and code are required" });
      }

      const [record] = await db
        .select()
        .from(phoneVerificationCodes)
        .where(eq(phoneVerificationCodes.phone, phone))
        .orderBy(phoneVerificationCodes.createdAt)
        .limit(1);

      if (!record) {
        return res.status(400).json({ message: "No verification code found. Please request a new code." });
      }
      if (record.used) {
        return res.status(400).json({ message: "This code has already been used." });
      }
      if (new Date() > record.expiresAt) {
        return res.status(400).json({ message: "This code has expired. Please request a new code." });
      }
      if (record.code !== String(code).trim()) {
        return res.status(400).json({ message: "Incorrect code. Please try again." });
      }

      await db.update(phoneVerificationCodes).set({ verified: true, used: true }).where(eq(phoneVerificationCodes.id, record.id));

      let user = await storage.getUserByPhone(phone);

      if (!user) {
        const name = (displayName || "").trim();
        if (!name || name.length < 2) {
          return res.status(200).json({
            needsDisplayName: true,
            message: "Enter your display name to create your account",
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
          presence: "online",
        } as any);

        await storage.addUserEmail(user.id, email, true, false);
        await storage.logAuthEvent("register_whatsapp", user.id, req.ip, req.headers["user-agent"]?.toString());
      } else {
        if (!user.phoneVerified) {
          await storage.updateUser(user.id, { phoneVerified: true });
          user = (await storage.getUser(user.id))!;
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

  app.post("/api/auth/register", registerLimiter, async (req: Request, res: Response) => {
    try {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        const errors = parsed.error.errors.map(e => ({ field: e.path.join("."), message: e.message }));
        return res.status(400).json({ message: "Validation failed", errors });
      }

      const { email, username, firstName, lastName, password } = parsed.data;
      const phone = normalizePhone(parsed.data.phone.trim());
      const { verificationId, emailVerificationId } = req.body;

      let phoneVerified = false;
      let emailVerifiedFlag = false;

      if (verificationId) {
        const [phoneRecord] = await db.select().from(phoneVerificationCodes).where(eq(phoneVerificationCodes.id, verificationId)).limit(1);
        if (!phoneRecord || !phoneRecord.verified || phoneRecord.used) {
          return res.status(400).json({ message: "Invalid or expired phone verification. Please request a new code.", field: "phone" });
        }
        if (phoneRecord.phone !== phone) {
          return res.status(400).json({ message: "Phone number does not match the verified number.", field: "phone" });
        }
        if (new Date() > phoneRecord.expiresAt) {
          return res.status(400).json({ message: "Phone verification has expired. Please request a new code.", field: "phone" });
        }
        phoneVerified = true;
      }

      if (emailVerificationId) {
        const [emailRecord] = await db.select().from(emailVerificationCodes).where(eq(emailVerificationCodes.id, emailVerificationId)).limit(1);
        if (!emailRecord || !emailRecord.verified || emailRecord.used) {
          return res.status(400).json({ message: "Invalid or expired email verification. Please request a new code.", field: "email" });
        }
        if (emailRecord.email !== email.trim().toLowerCase()) {
          return res.status(400).json({ message: "Email does not match the verified email.", field: "email" });
        }
        if (new Date() > emailRecord.expiresAt) {
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
      if (verificationId) markUsedOps.push(db.update(phoneVerificationCodes).set({ used: true }).where(eq(phoneVerificationCodes.id, verificationId)));
      if (emailVerificationId) markUsedOps.push(db.update(emailVerificationCodes).set({ used: true }).where(eq(emailVerificationCodes.id, emailVerificationId)));
      if (markUsedOps.length > 0) await Promise.all(markUsedOps);

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
        emailVerified: emailVerifiedFlag,
        phoneVerified: phoneVerified,
        lekkerNetworkAccess: false,
        autoReplyEnabled: false,
        notificationsEnabled: true,
        locationEnabled: false,
        presence: "online",
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

  app.get("/api/auth/emails", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const emails = await storage.getUserEmails(req.user!.userId);
      res.json({ emails });
    } catch (error) {
      console.error("Get emails error:", error);
      res.status(500).json({ message: "Failed to fetch linked emails" });
    }
  });

  app.post("/api/auth/add-email", authMiddleware, rateLimit({ windowMs: 15 * 60 * 1000, max: 5 } as Options), async (req: AuthenticatedRequest, res: Response) => {
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
      const userId = req.user!.userId;
      const pending = await storage.addUserEmail(userId, normalized, false, false);
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
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

  app.post("/api/auth/verify-linked-email", authMiddleware, rateLimit({ windowMs: 15 * 60 * 1000, max: 10 } as Options), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { emailId, code } = req.body;
      if (!emailId || !code) return res.status(400).json({ message: "emailId and code are required" });
      const userId = req.user!.userId;
      const emails = await storage.getUserEmails(userId);
      const target = emails.find(e => e.id === emailId);
      if (!target) return res.status(404).json({ message: "Email not found" });
      if (target.isVerified) return res.status(400).json({ message: "Email is already verified" });
      const [codeRecord] = await db.select().from(emailVerificationCodes)
        .where(eq(emailVerificationCodes.email, target.email))
        .orderBy(emailVerificationCodes.createdAt)
        .limit(1);
      if (!codeRecord || codeRecord.code !== code || codeRecord.used) {
        return res.status(400).json({ message: "Invalid or expired verification code" });
      }
      if (new Date() > codeRecord.expiresAt) {
        return res.status(400).json({ message: "Verification code has expired. Please request a new one." });
      }
      await db.update(emailVerificationCodes).set({ used: true, verified: true }).where(eq(emailVerificationCodes.id, codeRecord.id));
      await storage.verifyUserEmail(emailId, userId);
      res.json({ message: "Email verified successfully" });
    } catch (error) {
      console.error("Verify linked email error:", error);
      res.status(500).json({ message: "Failed to verify email" });
    }
  });

  app.delete("/api/auth/emails/:emailId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { emailId } = req.params;
      const userId = req.user!.userId;
      const emails = await storage.getUserEmails(userId);
      const target = emails.find(e => e.id === emailId);
      if (!target) return res.status(404).json({ message: "Email not found" });
      if (target.isPrimary) return res.status(400).json({ message: "Cannot remove your primary email" });
      if (emails.length === 1) return res.status(400).json({ message: "Cannot remove your only email address" });
      const removed = await storage.removeUserEmail(emailId, userId);
      if (!removed) return res.status(400).json({ message: "Could not remove email" });
      const remaining = await storage.getUserEmails(userId);
      const anyVerified = remaining.some(e => e.isVerified);
      if (!anyVerified) {
        await storage.updateUser(userId, { emailVerified: false });
      }
      res.json({ message: "Email removed" });
    } catch (error) {
      console.error("Remove email error:", error);
      res.status(500).json({ message: "Failed to remove email" });
    }
  });

  app.post("/api/auth/resend-linked-email-code", authMiddleware, rateLimit({ windowMs: 5 * 60 * 1000, max: 3 } as Options), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { emailId } = req.body;
      if (!emailId) return res.status(400).json({ message: "emailId is required" });
      const userId = req.user!.userId;
      const emails = await storage.getUserEmails(userId);
      const target = emails.find(e => e.id === emailId);
      if (!target) return res.status(404).json({ message: "Email not found" });
      if (target.isVerified) return res.status(400).json({ message: "Email is already verified" });
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
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

  app.post("/api/admin/seed-test-user", async (req: Request, res: Response) => {
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
        presence: "online",
      });
      res.json({ message: "Test user created", email: "test@lekker.chat", phone: "+27000000001", password: "Lekker@2026", id: user.id });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
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

  async function resolveOrCreateP2PChat(userId: string, participantId: string) {
    if (participantId === userId) {
      return { error: "Cannot create chat with yourself", status: 400 as const };
    }
    if (await storage.isEitherUserBlocked(userId, participantId)) {
      return { error: "You cannot message this user", status: 403 as const, code: "BLOCKED" as const };
    }
    const otherUser = await storage.getUser(participantId);
    if (!otherUser) {
      return { error: "User not found", status: 404 as const };
    }
    const existing = await storage.findExistingP2PChat(userId, participantId);
    if (existing) {
      const participants = await enrichParticipants(existing.id);
      return { chat: { ...existing, participants }, status: 200 as const };
    }
    const chat = await storage.createChat("p2p", userId);
    await storage.addChatParticipant(chat.id, userId, "owner");
    await storage.addChatParticipant(chat.id, participantId, "member");
    const participants = await enrichParticipants(chat.id);
    return { chat: { ...chat, participants }, status: 201 as const };
  }

  // ── Safety (App Store Guideline 1.2 — UGC) ───────────────────────────────

  app.get("/api/safety/blocks", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const blocks = await storage.getBlockedUsers(req.user!.userId);
      res.json({ blocks });
    } catch (error) {
      console.error("List blocks error:", error);
      res.status(500).json({ message: "Failed to load blocked users" });
    }
  });

  app.post("/api/safety/block", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { userId: blockedUserId } = req.body || {};
      const blockerId = req.user!.userId;
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

  app.delete("/api/safety/block/:userId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      await storage.unblockUser(req.user!.userId, req.params.userId);
      res.json({ ok: true });
    } catch (error) {
      console.error("Unblock user error:", error);
      res.status(500).json({ message: "Failed to unblock user" });
    }
  });

  app.post("/api/safety/report", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { reportType, reportedUserId, messageId, chatId, reason, details } = req.body || {};
      if (!reportType || !reason) {
        return res.status(400).json({ message: "reportType and reason are required" });
      }
      const allowed = ["user", "message", "chat"];
      if (!allowed.includes(reportType)) {
        return res.status(400).json({ message: "Invalid reportType" });
      }
      if (reportedUserId && reportedUserId === req.user!.userId) {
        return res.status(400).json({ message: "You cannot report yourself" });
      }
      const report = await storage.createContentReport({
        reporterId: req.user!.userId,
        reportedUserId: reportedUserId || null,
        messageId: messageId || null,
        chatId: chatId || null,
        reportType,
        reason: String(reason).slice(0, 50),
        details: details ? String(details).slice(0, 2000) : null,
      });
      console.log(`[safety] Report ${report.id} type=${reportType} reason=${reason} reporter=${req.user!.userId}`);
      res.status(201).json({
        ok: true,
        reportId: report.id,
        message: "Thank you. Our team reviews reports within 24 hours.",
      });
    } catch (error) {
      console.error("Content report error:", error);
      res.status(500).json({ message: "Failed to submit report" });
    }
  });

  app.post("/api/chats/start-with-contact", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const { userId: bodyUserId, lekkerNetworkId, phone } = req.body || {};

      let participantId: string | undefined = typeof bodyUserId === "string" ? bodyUserId : undefined;

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
          code: "USER_NOT_REGISTERED",
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

  app.post("/api/chats", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { participantId, type, name } = req.body;
      const userId = req.user!.userId;
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
        extras?.sharedContactName,
      )) {
        return;
      }

      const chatParticipantsList = await storage.getChatParticipants(chatId);
      for (const p of chatParticipantsList) {
        if (p.userId !== userId && await storage.isEitherUserBlocked(userId, p.userId)) {
          return res.status(403).json({
            message: "Messaging is not available with this user.",
            code: "BLOCKED",
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

  app.post("/api/chats/:chatId/messages/:messageId/poll-vote", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { chatId, messageId } = req.params;
      const userId = req.user!.userId;
      const { optionId } = req.body || {};

      if (!optionId || typeof optionId !== "string") {
        return res.status(400).json({ message: "optionId is required" });
      }

      const isParticipant = await storage.isUserInChat(chatId, userId);
      if (!isParticipant) {
        return res.status(403).json({ message: "Access denied" });
      }

      const [msg] = await db.select().from(chatMessages).where(
        and(eq(chatMessages.id, messageId), eq(chatMessages.chatId, chatId)),
      ).limit(1);

      if (!msg || msg.type !== "poll" || msg.isDeleted) {
        return res.status(404).json({ message: "Poll not found" });
      }

      let options: Array<{ id: string; text: string; votes?: string[] }> = [];
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
      target.votes = [...(target.votes || []), userId];

      const [updated] = await db.update(chatMessages)
        .set({ pollOptions: JSON.stringify(options) })
        .where(eq(chatMessages.id, messageId))
        .returning();

      res.json({ message: updated });
    } catch (error) {
      console.error("Poll vote error:", error);
      res.status(500).json({ message: "Failed to record vote" });
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

      if (rejectBlockedContent(res, content)) {
        return;
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

      const emailMatchIds = await db.selectDistinct({ userId: userEmails.userId })
        .from(userEmails)
        .where(sql`LOWER(${userEmails.email}) LIKE ${`%${query}%`}`);
      const emailMatchUserIds = emailMatchIds.map(r => r.userId).filter(id => id !== userId);

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
            ...(emailMatchUserIds.length > 0 ? [sql`${users.id} = ANY(ARRAY[${sql.join(emailMatchUserIds.map(id => sql`${id}`), sql`, `)}]::text[])`] : []),
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
      let workspaceEmailActive = false;
      if (profileData.lekkerWorkspaceId) {
        const emailStatus = await fetchWorkspaceEmailStatus(profileData.lekkerWorkspaceId);
        workspaceEmailActive = emailStatus.active;
      }
      const updated = await storage.updateUser(user.id, { ...profileData, workspaceEmailActive });

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
        model: "x-ai/grok-4.3",
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

  app.get("/api/lekker/session-token", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = await storage.getUser(req.user!.userId);
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
        url: `${base}/api/v1/mobile/establish-session?token=${encodeURIComponent(token)}`,
      });
    } catch (e) {
      res.status(500).json({ message: "Session token failed" });
    }
  });

  app.get("/api/lekker/email/status", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = await storage.getUser(req.user!.userId);
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

  app.get("/api/lekker/email/threads", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = await storage.getUser(req.user!.userId);
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

  app.get("/api/lekker/email/threads/:threadId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = await storage.getUser(req.user!.userId);
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

  app.post("/api/lekker/email/send", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = await storage.getUser(req.user!.userId);
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
        references,
      });
      if (!result) return res.status(502).json({ message: "Could not send email" });
      res.json({ success: true, ...result });
    } catch (e: any) {
      res.status(500).json({ message: e?.message || "Failed to send email" });
    }
  });

  app.get("/api/feed", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
      const authorId = typeof req.query.authorId === "string" ? req.query.authorId : undefined;
      const posts = await listFeedPosts({
        viewerId: req.user!.userId,
        authorId,
        page,
      });
      res.json({ posts });
    } catch (e) {
      res.status(500).json({ message: "Failed to load feed" });
    }
  });

  app.get("/api/feed/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const post = await getFeedPostById(req.params.id);
      if (!post) return res.status(404).json({ message: "Post not found" });
      res.json({ post });
    } catch (e) {
      res.status(500).json({ message: "Failed to load post" });
    }
  });

  app.post("/api/feed", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { content, mediaUrl } = req.body || {};
      if (!String(content || "").trim() && !mediaUrl) {
        return res.status(400).json({ message: "Post content or media is required" });
      }
      if (rejectBlockedContent(res, String(content || ""))) {
        return;
      }
      const result = await createFeedPost({
        authorId: req.user!.userId,
        content: String(content || "").trim() || "📸",
        mediaUrl: mediaUrl || null,
      });
      if (result === "duplicate") {
        return res.status(409).json({
          duplicate: true,
          message: "You've already posted similar content in the last 24 hours.",
        });
      }
      res.status(201).json({ post: result });
    } catch (e) {
      res.status(500).json({ message: "Failed to create post" });
    }
  });

  app.post("/api/feed/:id/like", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      await toggleFeedLike(req.params.id, req.user!.userId);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: "Failed to update like" });
    }
  });

  app.post("/api/feed/:id/share", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      await addFeedShare(req.params.id, req.user!.userId);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: "Failed to share post" });
    }
  });

  app.post("/api/feed/:id/comments", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const content = String(req.body?.content || "").trim();
      if (!content) return res.status(400).json({ message: "Comment is required" });
      if (rejectBlockedContent(res, content)) {
        return;
      }
      await addFeedComment({
        postId: req.params.id,
        authorId: req.user!.userId,
        content,
      });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: "Failed to add comment" });
    }
  });

  app.post("/api/push/register", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { expoPushToken, platform } = req.body || {};
      if (!expoPushToken || typeof expoPushToken !== "string") {
        return res.status(400).json({ message: "expoPushToken is required" });
      }
      if (!expoPushToken.startsWith("ExponentPushToken") && !expoPushToken.startsWith("ExpoPushToken")) {
        return res.status(400).json({ message: "Invalid Expo push token" });
      }
      await registerPushToken(req.user!.userId, expoPushToken, platform);
      res.json({ ok: true });
    } catch (e) {
      console.error("Push register error:", e);
      res.status(500).json({ message: "Failed to register push token" });
    }
  });

  app.delete("/api/push/register", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const expoPushToken = typeof req.body?.expoPushToken === "string" ? req.body.expoPushToken : undefined;
      await unregisterPushToken(req.user!.userId, expoPushToken);
      res.json({ ok: true });
    } catch (e) {
      console.error("Push unregister error:", e);
      res.status(500).json({ message: "Failed to unregister push token" });
    }
  });

  function connectUnavailable(res: Response) {
    return res.status(503).json({
      message: "Connect API not configured. Set LEKKER_WORKSPACE_ID and LEKKER_TOKEN.",
    });
  }

  app.get("/api/connect/feed", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    if (!isConnectConfigured()) return connectUnavailable(res);
    try {
      const params: Record<string, string> = {};
      for (const [key, value] of Object.entries(req.query)) {
        if (typeof value === "string") params[key] = value;
      }
      const data = await getConnectFeed(params);
      res.json(data);
    } catch (e: any) {
      console.error("Connect feed error:", e);
      res.status(502).json({ message: e?.message || "Connect feed failed" });
    }
  });

  app.post("/api/connect/contacts", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    if (!isConnectConfigured()) return connectUnavailable(res);
    try {
      const { name, email, phone, message, sourceUrl } = req.body || {};
      if (!name || typeof name !== "string") {
        return res.status(400).json({ message: "name is required" });
      }
      const data = await submitContactToLekker({ name, email, phone, message, sourceUrl });
      res.json(data);
    } catch (e: any) {
      console.error("Connect contact error:", e);
      res.status(502).json({ message: e?.message || "Contact submission failed" });
    }
  });

  app.get("/api/connect/products/search", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    if (!isConnectConfigured()) return connectUnavailable(res);
    try {
      const params: Record<string, string> = {};
      for (const [key, value] of Object.entries(req.query)) {
        if (typeof value === "string") params[key] = value;
      }
      const data = await searchProducts(params);
      res.json(data);
    } catch (e: any) {
      console.error("Connect product search error:", e);
      res.status(502).json({ message: e?.message || "Product search failed" });
    }
  });

  app.post("/api/connect/orders", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    if (!isConnectConfigured()) return connectUnavailable(res);
    try {
      const data = await submitOrder(req.body);
      res.json(data);
    } catch (e: any) {
      console.error("Connect order error:", e);
      res.status(502).json({ message: e?.message || "Order submission failed" });
    }
  });

  app.post("/api/connect/checkout", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    if (!isConnectConfigured()) return connectUnavailable(res);
    try {
      const data = await createCheckout(req.body);
      res.json(data);
    } catch (e: any) {
      console.error("Connect checkout error:", e);
      res.status(502).json({ message: e?.message || "Checkout failed" });
    }
  });

  app.post("/api/connect/shipping/quote", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    if (!isConnectConfigured()) return connectUnavailable(res);
    try {
      const data = await getShippingQuote(req.body);
      res.json(data);
    } catch (e: any) {
      console.error("Connect shipping quote error:", e);
      res.status(502).json({ message: e?.message || "Shipping quote failed" });
    }
  });

  app.get("/api/connect/gift-cards/validate", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    if (!isConnectConfigured()) return connectUnavailable(res);
    try {
      const code = String(req.query.code || "");
      if (!code) return res.status(400).json({ message: "code is required" });
      const data = await validateGiftCard(code);
      res.json(data);
    } catch (e: any) {
      console.error("Connect gift card error:", e);
      res.status(502).json({ message: e?.message || "Gift card validation failed" });
    }
  });

  app.post("/api/connect/portal/request-otp", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    if (!isConnectConfigured()) return connectUnavailable(res);
    try {
      const { email, phone, channel } = req.body || {};
      if (!channel || (channel !== "email" && channel !== "whatsapp")) {
        return res.status(400).json({ message: "channel must be email or whatsapp" });
      }
      const data = await requestPortalOtp({ email, phone, channel });
      res.json(data);
    } catch (e: any) {
      console.error("Connect portal OTP request error:", e);
      res.status(502).json({ message: e?.message || "Portal OTP request failed" });
    }
  });

  app.post("/api/connect/portal/verify-otp", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    if (!isConnectConfigured()) return connectUnavailable(res);
    try {
      const { email, phone, code } = req.body || {};
      if (!code) return res.status(400).json({ message: "code is required" });
      const data = await verifyPortalOtp({ email, phone, code });
      res.json(data);
    } catch (e: any) {
      console.error("Connect portal OTP verify error:", e);
      res.status(502).json({ message: e?.message || "Portal OTP verification failed" });
    }
  });

  app.get("/api/connect/portal/me", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    if (!isConnectConfigured()) return connectUnavailable(res);
    try {
      const sessionToken = req.headers["x-portal-token"];
      if (!sessionToken || typeof sessionToken !== "string") {
        return res.status(400).json({ message: "X-Portal-Token header is required" });
      }
      const data = await getPortalMe(sessionToken);
      res.json(data);
    } catch (e: any) {
      console.error("Connect portal me error:", e);
      res.status(502).json({ message: e?.message || "Portal session failed" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
