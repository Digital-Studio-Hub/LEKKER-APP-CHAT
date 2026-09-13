import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import rateLimit, { type Options } from "express-rate-limit";
import { registerSchema, loginSchema, updateProfileSchema, updatePersonalCareSchema, users, chatMessages, passwordResetCodes, phoneVerificationCodes, emailVerificationCodes, userEmails } from "@shared/schema";
import { storage, db } from "./storage";
import { sql, or, and, ne, eq, inArray, desc } from "drizzle-orm";
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
  isLekkerNetworkConfigured,
  chatWithNetworkCledwyn,
  streamNetworkCledwyn,
  streamNetworkGeneralistCledwyn,
  streamNetworkCompanionCledwyn,
  chatWithNetworkGeneralistCledwyn,
  chatWithNetworkCompanionCledwyn,
  fetchMarketplaceLeads,
  fetchMarketplaceLeadsUnreadCount,
  fetchMarketplaceLeadDetail,
  sendMarketplaceLeadMessage,
  updateMarketplaceLeadStatus,
  fetchMobileNotifications,
  LekkerNetworkApiError,
  type LekkerNetworkEntry,
  type WorkspaceDetail,
} from "./lekkerNetwork";
import { sendPasswordResetEmail, sendEmailVerificationEmail } from "./gmail";
import { sendPasswordResetSMS, sendPhoneVerificationSMS } from "./twilio";
import { sendWhatsAppOtp, isWhatsAppOtpConfigured, whatsAppOtpConfigStatus } from "./whatsapp-otp";
import {
  getAppleReviewConfig,
  isAppleReviewPhone,
  isAppleReviewLogin,
} from "./apple-review-auth";
import {
  listFeedPosts,
  getFeedPostById,
  createFeedPost,
  toggleFeedLike,
  addFeedShare,
  addFeedComment,
} from "./feed";
import { registerPushToken, unregisterPushToken, notifyChatMessage, notifyUserPush } from "./push";
import {
  getPersonalCare,
  publicPersonalCare,
  updatePersonalCare,
  bumpPatientReply,
  runCompanionCron,
} from "./personal-care";
import { containsBlockedContent, CONTENT_FILTER_MESSAGE } from "./content-filter";
import { isSocialMediaAllowed, type AgeRangeSource } from "../shared/age-gate";
import { requireSocialMediaAccess } from "./age-gate";
import {
  isConnectConfigured,
  LekkerConnectError,
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
  getBookingOfferings,
  createBooking,
  createBookingCheckout,
  joinBookingWaitlist,
  claimBookingHold,
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

/** SA-friendly phone variants so contact book formats still resolve registered users. */
function phoneLookupVariants(raw: string): string[] {
  const trimmed = (raw || "").trim();
  if (!trimmed) return [];
  const digits = trimmed.replace(/\D/g, "");
  const variants = new Set<string>([
    trimmed,
    trimmed.replace(/\s/g, ""),
    normalizePhone(trimmed),
  ]);
  if (digits.startsWith("27") && digits.length >= 11) {
    variants.add(`+${digits}`);
    variants.add(digits);
    variants.add(`0${digits.slice(2)}`);
  } else if (digits.startsWith("0") && digits.length >= 10) {
    variants.add(`+27${digits.slice(1)}`);
    variants.add(`27${digits.slice(1)}`);
    variants.add(digits);
  } else if (digits.length >= 9 && digits.length <= 11) {
    variants.add(`+27${digits}`);
    variants.add(`0${digits}`);
    variants.add(`27${digits}`);
  }
  return [...variants].filter(Boolean);
}

async function findUserByPhoneFlexible(phone: string) {
  const variants = phoneLookupVariants(phone);
  for (const variant of variants) {
    const match = await storage.getUserByPhone(variant);
    if (match) return match;
  }
  if (variants.length === 0) return undefined;
  const [row] = await db
    .select()
    .from(users)
    .where(inArray(users.phone, variants))
    .limit(1);
  return row;
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
    const lekkerMatch = await findLekkerpreneurByPhoneOrEmail(
      user.phone,
      user.email || "",
    );
    if (lekkerMatch) {
      const profileData = extractLekkerpreneurProfile(lekkerMatch);
      let workspaceEmailActive = false;
      if (profileData.lekkerWorkspaceId) {
        const emailStatus = await fetchWorkspaceEmailStatus(profileData.lekkerWorkspaceId);
        workspaceEmailActive = emailStatus.active;
      }
      // Don't overwrite a user-chosen email/username with empty Network values
      const patch: Record<string, unknown> = {
        ...profileData,
        workspaceEmailActive,
      };
      if (!profileData.email && user.email) delete patch.email;
      // Chat messaging is phone/WhatsApp-based — do not overwrite emailVerified from Network.
      delete patch.emailVerified;
      const updated = await storage.updateUser(user.id, patch as any);
      if (updated) {
        finalUser = updated;
        // Store Network email as a secondary email row when new
        if (profileData.email && profileData.email !== user.email) {
          try {
            await storage.addUserEmail(user.id, profileData.email, !user.email, !!profileData.emailVerified);
          } catch {
            /* unique conflict — ignore */
          }
        }
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
  skip: (req) => {
    const raw = req.body?.phone;
    return raw ? isAppleReviewPhone(String(raw)) : false;
  },
});

async function handleAppleReviewVerify(
  req: Request,
  res: Response,
  phone: string,
  _displayName?: string,
): Promise<void> {
  const config = getAppleReviewConfig();
  if (!config) {
    res.status(503).json({ message: "Apple Review login is not configured." });
    return;
  }

  let user = await storage.getUserByPhone(phone);

  if (!user) {
    // Passwordless: phone is the only required unique field
    const name = (config.displayName || "Apple Reviewer").trim();
    const randomColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];

    user = await storage.createUser({
      phone,
      email: null,
      username: null,
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
      presence: "online",
    } as any);

    await storage.logAuthEvent("register_apple_review", user.id, req.ip, req.headers["user-agent"]?.toString());
  } else {
    await storage.updateUser(user.id, { phoneVerified: true, emailVerified: true });
    const emails = await storage.getUserEmails(user.id);
    for (const row of emails) {
      if (!row.isVerified) {
        await storage.verifyUserEmail(row.id, user.id);
      }
    }
    user = (await storage.getUser(user.id))!;
    await storage.logAuthEvent("login_apple_review", user.id, req.ip, req.headers["user-agent"]?.toString());
  }

  const synced = await applyLekkerSync(user, req);
  const token = generateToken({
    userId: synced.id,
    email: synced.email || synced.phone || "",
    role: synced.role,
  });
  res.json({ user: sanitizeUser(synced), token });
}

export async function registerRoutes(app: Express): Promise<Server> {

  app.get("/api/health", (_req: Request, res: Response) => {
    const otp = whatsAppOtpConfigStatus();
    res.json({
      ok: true,
      service: "lekker-chat",
      whatsappOtpConfigured: otp.configured,
      whatsappOtp: {
        hasAccountSid: otp.hasAccountSid,
        accountSidLooksValid: otp.accountSidLooksValid,
        hasAuthToken: otp.hasAuthToken,
        hasFrom: otp.hasFrom,
        hasContentSid: otp.hasContentSid,
      },
    });
  });

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

      if (isAppleReviewPhone(phone)) {
        const existing = await storage.getUserByPhone(phone);
        return res.json({
          message: "Verification code sent via WhatsApp",
          isExistingUser: !!existing,
        });
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

      try {
        if (!isWhatsAppOtpConfigured()) {
          console.error("WhatsApp send-code blocked:", whatsAppOtpConfigStatus());
          await db.delete(phoneVerificationCodes).where(eq(phoneVerificationCodes.phone, phone));
          return res.status(503).json({
            message:
              "WhatsApp login is temporarily unavailable. Please try again later.",
            code: "WHATSAPP_OTP_NOT_CONFIGURED",
          });
        }

        await sendWhatsAppOtp(phone, code);
      } catch (sendErr) {
        await db.delete(phoneVerificationCodes).where(eq(phoneVerificationCodes.phone, phone));
        throw sendErr;
      }

      const existing = await storage.getUserByPhone(phone);
      res.json({
        message: "Verification code sent via WhatsApp",
        isExistingUser: !!existing,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("WhatsApp send-code error:", msg);
      if (msg.includes("TWILIO_ACCOUNT_SID_INVALID") || msg.includes("WHATSAPP_OTP_NOT_CONFIGURED")) {
        return res.status(503).json({
          message:
            "WhatsApp login is temporarily unavailable. Please try again later.",
          code: "WHATSAPP_OTP_NOT_CONFIGURED",
        });
      }
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

      // Apple Review static login — never consume DB OTPs; reusable across review sessions.
      if (isAppleReviewPhone(phone)) {
        if (isAppleReviewLogin(phone, String(code).trim())) {
          await handleAppleReviewVerify(req, res, phone, displayName);
          return;
        }
        return res.status(400).json({
          message: "Incorrect code. Please try again.",
        });
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
      if (record.code !== String(code).trim()) {
        return res.status(400).json({ message: "Incorrect code. Please try again." });
      }

      await db.update(phoneVerificationCodes).set({ verified: true, used: true }).where(eq(phoneVerificationCodes.id, record.id));

      let user = await storage.getUserByPhone(phone);

      if (!user) {
        // Identity = mobile number only. Email/username optional (Settings or Lekker Network).
        const randomColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];

        let firstName = "";
        let lastName = "";
        let email: string | null = null;
        let prefill: Record<string, unknown> = {};
        try {
          const lekkerMatch = await findLekkerpreneurByPhoneOrEmail(phone, "");
          if (lekkerMatch) {
            prefill = extractLekkerpreneurProfile(lekkerMatch) as Record<string, unknown>;
            if (typeof prefill.firstName === "string" && prefill.firstName.trim()) {
              firstName = String(prefill.firstName).trim();
              lastName = typeof prefill.lastName === "string" ? String(prefill.lastName) : "";
            }
            if (typeof prefill.email === "string" && prefill.email.trim()) {
              email = String(prefill.email).trim().toLowerCase();
            }
          }
        } catch (e) {
          console.error("Lekker prefill on WhatsApp register (non-fatal):", e);
        }

        const optionalName = (displayName || "").trim();
        if (!firstName && optionalName.length >= 2) {
          firstName = optionalName;
        }

        user = await storage.createUser({
          phone,
          email,
          username: null,
          firstName,
          lastName,
          passwordHash: null,
          avatarColor: randomColor,
          role: "user",
          // WhatsApp OTP is sufficient identity — email verify is never required to use Chat.
          emailVerified: true,
          phoneVerified: true,
          lekkerNetworkAccess: false,
          autoReplyEnabled: false,
          notificationsEnabled: true,
          locationEnabled: false,
          presence: "online",
          ...prefill,
          // Ensure phone-based identity wins over Network prefill
          email: email ?? (typeof prefill.email === "string" ? prefill.email : null),
          emailVerified: true,
          phoneVerified: true,
          username: null,
        } as any);

        if (user.email) {
          try {
            await storage.addUserEmail(user.id, user.email, true, !!user.emailVerified);
          } catch {
            /* ignore duplicate */
          }
        }
        await storage.logAuthEvent("register_whatsapp", user.id, req.ip, req.headers["user-agent"]?.toString());
      } else {
        // Phone OTP login is enough — clear any legacy emailVerified=false gate.
        const waPatch: { phoneVerified?: boolean; emailVerified?: boolean } = {};
        if (!user.phoneVerified) waPatch.phoneVerified = true;
        if (!user.emailVerified) waPatch.emailVerified = true;
        if (Object.keys(waPatch).length) {
          await storage.updateUser(user.id, waPatch);
          user = (await storage.getUser(user.id))!;
        }
        await storage.logAuthEvent("login_whatsapp", user.id, req.ip, req.headers["user-agent"]?.toString());
      }

      const synced = await applyLekkerSync(user, req);
      const token = generateToken({
        userId: synced.id,
        email: synced.email || synced.phone || "",
        role: synced.role,
      });
      res.json({ user: sanitizeUser(synced), token });
    } catch (err) {
      console.error("WhatsApp verify error:", err);
      res.status(500).json({ message: "Verification failed. Please try again." });
    }
  });

  app.post("/api/auth/register", registerLimiter, async (req: Request, res: Response) => {
    if (process.env.CHAT_WHATSAPP_ONLY !== "false") {
      return res.status(410).json({ message: "Use WhatsApp OTP to sign in. Password login is disabled." });
    }
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
    if (process.env.CHAT_WHATSAPP_ONLY !== "false") {
      return res.status(410).json({ message: "Use WhatsApp OTP to sign in. Password login is disabled." });
    }
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
    if (process.env.CHAT_WHATSAPP_ONLY !== "false") {
      return res.status(410).json({ message: "Use WhatsApp OTP to sign in. Password login is disabled." });
    }
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
    if (process.env.CHAT_WHATSAPP_ONLY !== "false") {
      return res.status(410).json({ message: "Use WhatsApp OTP to sign in. Password login is disabled." });
    }
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
    if (process.env.CHAT_WHATSAPP_ONLY !== "false") {
      return res.status(410).json({ message: "Use WhatsApp OTP to sign in. Password login is disabled." });
    }
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
      await db.delete(emailVerificationCodes).where(eq(emailVerificationCodes.email, normalized));
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      await db.insert(emailVerificationCodes).values({ email: normalized, code, expiresAt });
      const userForEmail = await storage.getUser(userId);
      const sent = await sendEmailVerificationEmail(normalized, code, userForEmail?.firstName || "there");
      if (!sent) {
        return res.status(502).json({
          emailId: pending.id,
          message: "Could not send the verification email. Check the address and try again in a moment.",
        });
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
      // Newest unused code wins (resend must not leave the old OTP as the match target)
      const [codeRecord] = await db.select().from(emailVerificationCodes)
        .where(and(
          eq(emailVerificationCodes.email, target.email),
          eq(emailVerificationCodes.used, false),
        ))
        .orderBy(desc(emailVerificationCodes.createdAt))
        .limit(1);
      if (!codeRecord || codeRecord.code !== String(code).trim()) {
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
      await db.delete(emailVerificationCodes).where(eq(emailVerificationCodes.email, target.email));
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      await db.insert(emailVerificationCodes).values({ email: target.email, code, expiresAt });
      const userForEmail = await storage.getUser(userId);
      const sent = await sendEmailVerificationEmail(target.email, code, userForEmail?.firstName || "there");
      if (!sent) {
        return res.status(502).json({ message: "Could not send the verification email. Please try again shortly." });
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

  /**
   * WhatsApp-style: given phone numbers from the device address book, return
   * which ones belong to registered Lekker Chat users. Anyone with an account
   * is messageable — no mutual friendship required.
   */
  app.post("/api/contacts/match", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const rawPhones = Array.isArray(req.body?.phones) ? req.body.phones : [];
      if (rawPhones.length === 0) {
        return res.json({ matches: [] });
      }
      if (rawPhones.length > 1000) {
        return res.status(400).json({ message: "Too many phone numbers (max 1000)" });
      }

      const requestPhones = rawPhones
        .filter((p: unknown): p is string => typeof p === "string" && p.trim().length > 0)
        .map((p: string) => p.trim())
        .slice(0, 1000);

      const variantToRequestPhone = new Map<string, string>();
      const allVariants: string[] = [];
      for (const phone of requestPhones) {
        for (const variant of phoneLookupVariants(phone)) {
          if (!variantToRequestPhone.has(variant)) {
            variantToRequestPhone.set(variant, normalizePhone(phone));
            allVariants.push(variant);
          }
        }
      }

      if (allVariants.length === 0) {
        return res.json({ matches: [] });
      }

      const found = await db
        .select({
          id: users.id,
          phone: users.phone,
          firstName: users.firstName,
          lastName: users.lastName,
          username: users.username,
          avatarColor: users.avatarColor,
          profilePhoto: users.profilePhoto,
          isVerifiedLekkerpreneur: users.isVerifiedLekkerpreneur,
          businessName: users.businessName,
          presence: users.presence,
        })
        .from(users)
        .where(and(inArray(users.phone, allVariants), ne(users.id, userId)));

      const matches = found.map((u) => ({
        phone: variantToRequestPhone.get(u.phone) || normalizePhone(u.phone),
        userId: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        username: u.username,
        avatarColor: u.avatarColor,
        profilePhoto: u.profilePhoto,
        isVerifiedLekkerpreneur: u.isVerifiedLekkerpreneur,
        businessName: u.businessName,
        presence: u.presence,
      }));

      res.json({ matches });
    } catch (error) {
      console.error("Contacts match error:", error);
      res.status(500).json({ message: "Failed to match contacts" });
    }
  });

  /**
   * Light invite analytics — no raw phones. Logs to console + auth_audit_logs
   * (event: whatsapp_invite) so we can measure WA invite → install later.
   */
  app.post("/api/analytics/invite", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const countRaw = req.body?.count;
      const count = typeof countRaw === "number" ? countRaw : parseInt(String(countRaw ?? "0"), 10);
      if (!Number.isFinite(count) || count < 1 || count > 100) {
        return res.status(400).json({ message: "count must be 1–100" });
      }
      const channel = typeof req.body?.channel === "string" ? req.body.channel : "whatsapp";
      const source = typeof req.body?.source === "string" ? req.body.source : "new-chat";
      const payload = { channel, count, source };
      console.log("[analytics/invite]", userId, JSON.stringify(payload));
      await storage.logAuthEvent(
        "whatsapp_invite",
        userId,
        req.ip,
        req.headers["user-agent"]?.toString(),
        JSON.stringify(payload),
      );
      return res.status(204).send();
    } catch (error) {
      console.error("Invite analytics error:", error);
      res.status(500).json({ message: "Failed to log invite" });
    }
  });

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
        const match = await findUserByPhoneFlexible(phone.trim());
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
      // Ensure every account has a pinned Quick Notes (self) chat
      await storage.ensureQuickNotesChat(userId);
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
      // WhatsApp-style: phone is the sole identity needed to message.
      // Email remains optional for mail/SSO features.
      if (!sender?.phoneVerified) {
        return res.status(403).json({
          message: "Verify your phone number before sending messages.",
          code: "UNVERIFIED",
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

      // Expo push via push.ts (uses expoPushToken schema)
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

      const chat = await storage.getChat(chatId);
      if (chat?.type === "notes") {
        return res.status(400).json({
          message: "Quick Notes stays pinned — clear messages inside instead of deleting the chat.",
          code: "QUICK_NOTES_PROTECTED",
        });
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
      const { fetchMarketplaceServiceCategories } = await import("./lekkerNetwork");
      const [apiResult, marketplaceParents] = await Promise.all([
        fetchLekkerDirectory({
          page: page ? Number(page) : 1,
          limit: limitParam ? Math.min(Number(limitParam), 100) : 20,
          search: typeof search === "string" ? search : undefined,
          location: typeof province === "string" ? province : undefined,
          // Pass slug or name — LN resolves Marketplace parents
          category: typeof serviceType === "string" ? serviceType : undefined,
          sort: typeof sort === "string" ? sort : undefined,
        }),
        fetchMarketplaceServiceCategories().catch(() => null),
      ]);

      if (apiResult?.success && apiResult.data) {
        const entries = apiResult.data.map((d) => buildDirectoryEntry(d));
        const fromApi =
          apiResult.filters?.serviceCategories?.map((c) => c.name) ||
          apiResult.filters?.serviceTypes ||
          marketplaceParents?.map((c) => c.name) ||
          SERVICE_TYPES;

        return res.json({
          entries,
          total: apiResult.total,
          page: apiResult.page,
          limit: apiResult.limit,
          filters: {
            serviceTypes: fromApi,
            serviceCategories: apiResult.filters?.serviceCategories || marketplaceParents || [],
            provinces: PROVINCES,
          },
          source: "lekker_network",
        });
      }
    } catch (e) {
      console.error("Lekker Network directory fetch error (falling back):", e);
    }

    const isProdOrCloudRun =
      process.env.NODE_ENV === "production" || Boolean(process.env.K_SERVICE);
    if (isProdOrCloudRun) {
      return res.json({
        entries: [],
        filters: { serviceTypes: SERVICE_TYPES, provinces: PROVINCES },
        source: "error",
        message: "Directory temporarily unavailable",
      });
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
      const { fetchLekkerpreneurDetail } = await import("./lekkerNetwork");
      const detail = await fetchLekkerpreneurDetail(req.params.id);
      if (detail) {
        return res.json({
          ...buildDirectoryEntry(detail),
          source: "lekker_network",
        });
      }
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

  /**
   * Directory → Network Marketplace lead (privacy-first).
   * Default anonymous contact: phone/email hidden from the lekkerpreneur; they reply
   * in Marketplace / Network portal; seeker continues in Chat enquiry thread.
   * Body.shareContact=true opts in to share phone + email with the provider.
   */
  /** Resolve a website deep link workspace → directory entry + Chat registration. */
  app.get("/api/directory/by-workspace/:workspaceId", optionalAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const workspaceId = String(req.params.workspaceId || "").trim();
      if (!workspaceId) {
        return res.status(400).json({ success: false, message: "workspaceId required" });
      }
      if (!isLekkerNetworkConfigured()) {
        return res.status(503).json({ success: false, message: "lekker.network unavailable" });
      }
      const ws = await fetchWorkspaceById(workspaceId);
      if (!ws) {
        return res.status(404).json({ success: false, message: "Business not found" });
      }
      const businessName =
        ws.businessName || ws.tradingName || ws.workspaceName || "Business";
      // Prefer Chat user linked to this workspace
      const chatUsers = await db
        .select()
        .from(users)
        .where(eq(users.lekkerWorkspaceId, workspaceId))
        .limit(5);
      const owner =
        chatUsers.find((u) => u.isVerifiedLekkerpreneur) || chatUsers[0] || null;
      let lekkerNetworkId = owner?.lekkerNetworkId || null;
      let phone = owner?.phone || ws.phone || null;
      if (!lekkerNetworkId && phone) {
        const byPhone = await storage.getUserByPhone(phone);
        if (byPhone?.lekkerNetworkId) lekkerNetworkId = byPhone.lekkerNetworkId;
      }
      return res.json({
        success: true,
        business: {
          workspaceId,
          businessName,
          lekkerNetworkId,
          phone,
          chatUserRegistered: !!owner,
          province: ws.province || null,
        },
      });
    } catch (error) {
      console.error("by-workspace resolve error:", error);
      res.status(500).json({ success: false, message: "Failed to resolve business" });
    }
  });

  app.post("/api/directory/enquire", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ success: false, message: "Unauthorized" });

      const targetWorkspaceId = String(req.body?.targetWorkspaceId || "").trim();
      const summary = String(req.body?.summary || "").trim();
      if (!targetWorkspaceId || summary.length < 3) {
        return res.status(400).json({
          success: false,
          message: "targetWorkspaceId and a short summary are required",
        });
      }

      if (!user.phone && !user.email) {
        return res.status(400).json({
          success: false,
          message: "Add a phone or email in Settings so you can receive replies (kept private until you share).",
        });
      }

      const shareContact = req.body?.shareContact === true;
      const privacyBody = req.body?.privacy && typeof req.body.privacy === "object" ? req.body.privacy : null;
      const sharePhone = privacyBody?.sharePhone === true || shareContact;
      const shareEmail = privacyBody?.shareEmail === true || shareContact;

      const fullName =
        `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.username || "Lekker Chat user";

      const { createDirectoryEnquiry } = await import("./lekkerNetwork");
      const result = await createDirectoryEnquiry({
        targetWorkspaceId,
        seekerName: fullName,
        seekerEmail: user.email || null,
        seekerPhone: user.phone || null,
        summary,
        province: req.body?.province || user.businessProvince || null,
        serviceCategorySlugs: Array.isArray(req.body?.serviceCategorySlugs)
          ? req.body.serviceCategorySlugs
          : undefined,
        privacy: {
          sharePhone,
          shareEmail,
          shareLocation: privacyBody?.shareLocation === true,
          shareBrief: true,
        },
        sourceUrl:
          typeof req.body?.sourceUrl === "string" && req.body.sourceUrl.trim()
            ? req.body.sourceUrl.trim().slice(0, 500)
            : "lekker-chat://directory",
      });

      if (!result?.success || !result.leadId) {
        return res.status(400).json({
          success: false,
          message: result?.message || "Could not create enquiry on lekker.network",
        });
      }

      return res.status(201).json({
        success: true,
        leadId: result.leadId,
        lead: result.lead,
        anonymous: !sharePhone && !shareEmail,
      });
    } catch (error: any) {
      console.error("Directory enquire error:", error);
      res.status(500).json({ success: false, message: "Failed to send enquiry" });
    }
  });

  app.get("/api/enquiries", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = await storage.getUser(req.user!.userId);
      if (!user) return res.status(401).json({ success: false, message: "Unauthorized" });
      const { fetchSeekerEnquiries } = await import("./lekkerNetwork");
      const result = await fetchSeekerEnquiries(user.email, user.phone);
      return res.json({ success: true, leads: result?.leads || [] });
    } catch (error) {
      console.error("List enquiries error:", error);
      res.status(500).json({ success: false, message: "Failed to list enquiries" });
    }
  });

  app.get("/api/enquiries/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = await storage.getUser(req.user!.userId);
      if (!user) return res.status(401).json({ success: false, message: "Unauthorized" });
      const url = new URL(
        `${process.env.LEKKER_API_BASE_URL || "https://lekker.network"}/api/v1/chat/enquiries/${req.params.id}`,
      );
      if (user.email) url.searchParams.set("email", user.email);
      if (user.phone) url.searchParams.set("phone", user.phone);
      if (user.lekkerWorkspaceId) url.searchParams.set("workspaceId", user.lekkerWorkspaceId);
      const apiKey = process.env.LEKKER_NETWORK_API_KEY || "";
      const r = await fetch(url.toString(), { headers: { "X-API-Key": apiKey, Accept: "application/json" } });
      const data = await r.json();
      return res.status(r.status).json(data);
    } catch (error) {
      console.error("Get enquiry error:", error);
      res.status(500).json({ success: false, message: "Failed to load enquiry" });
    }
  });

  app.post("/api/enquiries/:id/messages", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = await storage.getUser(req.user!.userId);
      if (!user) return res.status(401).json({ success: false, message: "Unauthorized" });
      const content = String(req.body?.content || "").trim();
      if (!content) return res.status(400).json({ success: false, message: "content required" });

      const asProvider = !!req.body?.asProvider && !!user.lekkerWorkspaceId;
      const { sendEnquiryMessage } = await import("./lekkerNetwork");
      const result = await sendEnquiryMessage(req.params.id, {
        content,
        role: asProvider ? "provider" : "seeker",
        email: user.email,
        phone: user.phone,
        workspaceId: asProvider ? user.lekkerWorkspaceId! : undefined,
      });
      if (!result?.success) {
        return res.status(400).json({ success: false, message: (result as any)?.message || "Failed" });
      }
      return res.json(result);
    } catch (error) {
      console.error("Enquiry message error:", error);
      res.status(500).json({ success: false, message: "Failed to send" });
    }
  });

  app.patch("/api/enquiries/:id/privacy", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = await storage.getUser(req.user!.userId);
      if (!user) return res.status(401).json({ success: false, message: "Unauthorized" });
      const { updateEnquiryPrivacy } = await import("./lekkerNetwork");
      const result = await updateEnquiryPrivacy(req.params.id, {
        email: user.email,
        phone: user.phone,
        sharePhone: req.body?.sharePhone === true,
        shareEmail: req.body?.shareEmail === true,
      });
      if (!result?.success) {
        return res.status(400).json({ success: false, message: (result as any)?.message || "Failed" });
      }
      return res.json(result);
    } catch (error) {
      console.error("Enquiry privacy error:", error);
      res.status(500).json({ success: false, message: "Failed to update privacy" });
    }
  });

  /** Provider Marketplace Leads — native Software module (Network SoT). */
  function requireProviderWorkspace(user: Awaited<ReturnType<typeof storage.getUser>>) {
    if (!user?.isVerifiedLekkerpreneur || !user.lekkerNetworkId || !user.lekkerWorkspaceId) {
      return null;
    }
    return { userId: user.lekkerNetworkId, workspaceId: user.lekkerWorkspaceId };
  }

  app.get("/api/marketplace-leads", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = await storage.getUser(req.user!.userId);
      const ids = requireProviderWorkspace(user);
      if (!ids) {
        return res.status(403).json({
          success: false,
          message: "Verified Lekkerpreneur workspace required. Sync in Settings.",
        });
      }
      if (!isLekkerNetworkConfigured()) {
        return res.status(503).json({ success: false, message: "lekker.network unavailable" });
      }
      const data = await fetchMarketplaceLeads({
        ...ids,
        page: req.query.page != null ? Number(req.query.page) : 1,
        limit: req.query.limit != null ? Number(req.query.limit) : 20,
        status: typeof req.query.status === "string" ? req.query.status : "open",
        q: typeof req.query.q === "string" ? req.query.q : undefined,
      });
      return res.json(data);
    } catch (error: any) {
      console.error("Marketplace leads list error:", error);
      const status = error instanceof LekkerNetworkApiError ? error.status : 500;
      res.status(status).json({
        success: false,
        message: error?.message || "Failed to load leads",
      });
    }
  });

  app.get("/api/marketplace-leads/unread-count", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = await storage.getUser(req.user!.userId);
      const ids = requireProviderWorkspace(user);
      if (!ids) return res.json({ success: true, count: 0 });
      if (!isLekkerNetworkConfigured()) return res.json({ success: true, count: 0 });
      const data = await fetchMarketplaceLeadsUnreadCount(ids.userId, ids.workspaceId);
      return res.json({ success: true, count: data?.count ?? 0 });
    } catch (error) {
      console.error("Marketplace leads unread error:", error);
      res.json({ success: true, count: 0 });
    }
  });

  app.get("/api/marketplace-leads/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = await storage.getUser(req.user!.userId);
      const ids = requireProviderWorkspace(user);
      if (!ids) {
        return res.status(403).json({ success: false, message: "Verified Lekkerpreneur workspace required" });
      }
      const data = await fetchMarketplaceLeadDetail({ leadId: req.params.id, ...ids });
      return res.json(data);
    } catch (error: any) {
      console.error("Marketplace lead detail error:", error);
      const status = error instanceof LekkerNetworkApiError ? error.status : 500;
      res.status(status).json({
        success: false,
        message: error?.message || "Failed to load lead",
      });
    }
  });

  app.post("/api/marketplace-leads/:id/messages", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = await storage.getUser(req.user!.userId);
      const ids = requireProviderWorkspace(user);
      if (!ids) {
        return res.status(403).json({ success: false, message: "Verified Lekkerpreneur workspace required" });
      }
      const content = String(req.body?.content || "").trim();
      if (!content) return res.status(400).json({ success: false, message: "content required" });
      const data = await sendMarketplaceLeadMessage({
        leadId: req.params.id,
        ...ids,
        content,
      });
      return res.status(201).json(data);
    } catch (error: any) {
      console.error("Marketplace lead message error:", error);
      const status = error instanceof LekkerNetworkApiError ? error.status : 500;
      res.status(status).json({
        success: false,
        message: error?.message || "Failed to send",
      });
    }
  });

  app.patch("/api/marketplace-leads/:id/status", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = await storage.getUser(req.user!.userId);
      const ids = requireProviderWorkspace(user);
      if (!ids) {
        return res.status(403).json({ success: false, message: "Verified Lekkerpreneur workspace required" });
      }
      const status = req.body?.status;
      if (status !== "contacted" && status !== "closed") {
        return res.status(400).json({ success: false, message: "status must be contacted or closed" });
      }
      const data = await updateMarketplaceLeadStatus({
        leadId: req.params.id,
        ...ids,
        status,
      });
      return res.json(data);
    } catch (error: any) {
      console.error("Marketplace lead status error:", error);
      const httpStatus = error instanceof LekkerNetworkApiError ? error.status : 500;
      res.status(httpStatus).json({
        success: false,
        message: error?.message || "Failed to update status",
      });
    }
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
      if (!isLekkerNetworkConfigured()) {
        return res.status(503).json({
          matched: false,
          message: "Lekker Network sync is temporarily unavailable. Please try again later.",
        });
      }

      const user = await storage.getUser(req.user!.userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (!user.phone && !user.email) {
        return res.status(400).json({
          matched: false,
          message: "Add a phone number or verified email before syncing with Lekker Network.",
        });
      }

      const match = await findLekkerpreneurByPhoneOrEmail(user.phone, user.email);
      if (!match) {
        return res.json({
          matched: false,
          message:
            "No matching Lekkerpreneur found for your phone or email. Use the same number/email as on lekker.network.",
        });
      }

      const profileData = extractLekkerpreneurProfile(match);
      let workspaceEmailActive = false;
      if (profileData.lekkerWorkspaceId) {
        const emailStatus = await fetchWorkspaceEmailStatus(profileData.lekkerWorkspaceId);
        workspaceEmailActive = emailStatus.active;
      }
      // Sync success → turn on Cledwyn workspace mode (satellite agent + Network alerts).
      const updated = await storage.updateUser(user.id, {
        ...profileData,
        workspaceEmailActive,
        lekkerNetworkAccess: true,
      });

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

  /** Network unified notifications for Cledwyn thread (workspace mode). */
  app.get("/api/cledwyn/notifications", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = await storage.getUser(req.user!.userId);
      if (
        !user?.lekkerNetworkAccess ||
        !user.isVerifiedLekkerpreneur ||
        !user.lekkerNetworkId ||
        !user.lekkerWorkspaceId
      ) {
        return res.json({ success: true, items: [] });
      }
      if (!isLekkerNetworkConfigured()) {
        return res.status(503).json({ success: false, message: "lekker.network unavailable" });
      }
      const data = await fetchMobileNotifications({
        userId: user.lekkerNetworkId,
        workspaceId: user.lekkerWorkspaceId,
        limit: req.query.limit != null ? Number(req.query.limit) : 25,
      });
      return res.json({ success: true, items: data?.items || [] });
    } catch (error: any) {
      console.error("Cledwyn notifications error:", error);
      const status = error instanceof LekkerNetworkApiError ? error.status : 500;
      res.status(status).json({
        success: false,
        message: error?.message || "Failed to load notifications",
        items: [],
      });
    }
  });

  /** Personal Settings (Safe Browse + Companion). PIN is device-only. */
  app.get("/api/personal/settings", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const row = await getPersonalCare(req.user!.userId);
      return res.json({ success: true, settings: publicPersonalCare(row) });
    } catch (error) {
      console.error("personal settings get error:", error);
      res.status(500).json({ success: false, message: "Failed to load personal settings" });
    }
  });

  app.put("/api/personal/settings", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const parsed = updatePersonalCareSchema.safeParse(req.body || {});
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          message: parsed.error.errors[0]?.message || "Invalid settings",
        });
      }
      const updated = await updatePersonalCare(req.user!.userId, parsed.data);
      return res.json({ success: true, settings: publicPersonalCare(updated) });
    } catch (error: any) {
      const status = error?.status || 500;
      console.error("personal settings put error:", error);
      res.status(status).json({ success: false, message: error?.message || "Failed to save" });
    }
  });

  app.post("/api/personal/patient-activity", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      await bumpPatientReply(req.user!.userId);
      return res.json({ success: true });
    } catch (error) {
      console.error("patient-activity error:", error);
      res.status(500).json({ success: false, message: "Failed" });
    }
  });

  /** Cloud Scheduler → companion check-ins + family silence alerts */
  app.post("/api/cron/companion", async (req: Request, res: Response) => {
    const secret = process.env.COMPANION_CRON_SECRET || process.env.CRON_SECRET;
    const header = req.header("X-Cron-Secret") || req.header("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!secret || header !== secret) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    try {
      const result = await runCompanionCron();
      return res.json({ success: true, ...result });
    } catch (error) {
      console.error("companion cron error:", error);
      res.status(500).json({ success: false, message: "Cron failed" });
    }
  });

  /**
   * Cledwyn AI — always Network SoT (no local LLM on Chat Cloud Run).
   * - Personal Companion ON → Network companion (dementia) mode (wins over workspace)
   * - Synced lekkerpreneur + lekkerNetworkAccess ON → Network workspace (satellite) Cledwyn
   * - Everyone else (or workspace failure) → Network generalist / consumer Cledwyn
   * Always responds as SSE for the mobile client.
   */
  app.post("/api/cledwyn/chat", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { messages, sessionId: bodySessionId, lekkerNetworkAccess: bodyAccess } = req.body || {};
      const userId = req.user!.userId;
      const userProfile = await storage.getUser(userId);
      const personalCare = await getPersonalCare(userId);
      const useCompanion = personalCare?.companionEnabled === true;

      const lastUserMessage = Array.isArray(messages)
        ? [...messages].reverse().find((m: any) => m?.role === "user" && typeof m.content === "string")
        : null;
      const latestText = (lastUserMessage?.content || "").trim();
      if (!latestText) {
        return res.status(400).json({ error: "A user message is required" });
      }

      if (!isLekkerNetworkConfigured()) {
        return res.status(503).json({
          error: "Cledwyn requires lekker.network connectivity. Try again shortly.",
        });
      }

      // Body may be ahead of DB briefly after toggle; prefer stored profile, allow body true only if synced.
      const accessOn =
        userProfile?.lekkerNetworkAccess === true ||
        (bodyAccess === true &&
          !!userProfile?.isVerifiedLekkerpreneur &&
          !!userProfile?.lekkerWorkspaceId);

      const useWorkspaceCledwyn =
        !useCompanion &&
        accessOn &&
        !!userProfile?.isVerifiedLekkerpreneur &&
        !!userProfile?.lekkerNetworkId &&
        !!userProfile?.lekkerWorkspaceId;

      const displayName = userProfile
        ? [userProfile.firstName, userProfile.lastName].filter(Boolean).join(" ").trim() ||
          userProfile.businessName ||
          null
        : null;
      const history = Array.isArray(messages)
        ? messages
            .filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
            .map((m: any) => ({ role: m.role as string, content: String(m.content) }))
            .slice(-12)
        : [];

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      const runGeneralist = async (metaMode: string, preface?: string) => {
        if (preface) {
          res.write(`data: ${JSON.stringify({ content: preface })}\n\n`);
        }
        res.write(`data: ${JSON.stringify({ meta: { mode: metaMode } })}\n\n`);
        let gotContent = false;
        try {
          for await (const ev of streamNetworkGeneralistCledwyn({
            message: latestText,
            userId: userProfile?.lekkerNetworkId || null,
            displayName,
            history,
            sessionId: typeof bodySessionId === "string" ? bodySessionId : null,
          })) {
            if (ev.meta?.sessionId) {
              res.write(
                `data: ${JSON.stringify({ meta: { sessionId: ev.meta.sessionId, mode: metaMode } })}\n\n`,
              );
            }
            if (ev.content) {
              gotContent = true;
              res.write(`data: ${JSON.stringify({ content: ev.content })}\n\n`);
            }
            if (ev.done) break;
          }
          if (!gotContent) {
            const result = await chatWithNetworkGeneralistCledwyn({
              message: latestText,
              userId: userProfile?.lekkerNetworkId || null,
              displayName,
              history,
              sessionId: typeof bodySessionId === "string" ? bodySessionId : null,
            });
            const reply = result.reply || "Sorry, I couldn't generate a response. Please try again.";
            res.write(`data: ${JSON.stringify({ content: reply })}\n\n`);
          }
        } catch (genErr: any) {
          console.warn("[cledwyn] Network generalist failed:", genErr?.message || genErr);
          const msg =
            "Cledwyn is briefly unavailable. Please try again in a moment" +
            (userProfile?.isVerifiedLekkerpreneur
              ? ", or open Software → Cledwyn on lekker.network."
              : ".");
          res.write(`data: ${JSON.stringify({ content: msg })}\n\n`);
        }
        res.write("data: [DONE]\n\n");
        res.end();
      };

      if (useCompanion) {
        try {
          await bumpPatientReply(userId);
          res.write(
            `data: ${JSON.stringify({
              meta: {
                mode: "companion",
                profile: personalCare?.companionProfile || "dementia",
              },
            })}\n\n`,
          );
          let gotContent = false;
          for await (const ev of streamNetworkCompanionCledwyn({
            message: latestText,
            userId: userProfile?.lekkerNetworkId || userId,
            displayName,
            history,
            sessionId: typeof bodySessionId === "string" ? bodySessionId : null,
            profile: personalCare?.companionProfile || "dementia",
          })) {
            if (ev.meta?.sessionId) {
              res.write(
                `data: ${JSON.stringify({ meta: { sessionId: ev.meta.sessionId, mode: "companion" } })}\n\n`,
              );
            }
            if (ev.content) {
              gotContent = true;
              res.write(`data: ${JSON.stringify({ content: ev.content })}\n\n`);
            }
            if (ev.done) break;
          }
          if (!gotContent) {
            const result = await chatWithNetworkCompanionCledwyn({
              message: latestText,
              userId: userProfile?.lekkerNetworkId || userId,
              displayName,
              history,
              sessionId: typeof bodySessionId === "string" ? bodySessionId : null,
              profile: personalCare?.companionProfile || "dementia",
            });
            const reply = result.reply || "I'm here with you. Tell me how you're feeling.";
            res.write(`data: ${JSON.stringify({ content: reply })}\n\n`);
          }
          res.write("data: [DONE]\n\n");
          res.end();
          return;
        } catch (compErr: any) {
          console.warn("[cledwyn] companion mode failed, falling back:", compErr?.message || compErr);
          return runGeneralist(
            "companion-fallback",
            "I'm having a little trouble connecting, but I'm still here with you.\n\n",
          );
        }
      }

      if (useWorkspaceCledwyn) {
        try {
          res.write(`data: ${JSON.stringify({ meta: { mode: "workspace" } })}\n\n`);
          let gotContent = false;
          for await (const ev of streamNetworkCledwyn({
            userId: userProfile!.lekkerNetworkId!,
            workspaceId: userProfile!.lekkerWorkspaceId!,
            message: latestText,
            sessionId: typeof bodySessionId === "string" ? bodySessionId : null,
          })) {
            if (ev.meta?.sessionId) {
              res.write(
                `data: ${JSON.stringify({ meta: { sessionId: ev.meta.sessionId, mode: "workspace" } })}\n\n`,
              );
            }
            if (ev.content) {
              gotContent = true;
              res.write(`data: ${JSON.stringify({ content: ev.content })}\n\n`);
            }
            if (ev.done) break;
          }
          if (!gotContent) {
            const result = await chatWithNetworkCledwyn({
              userId: userProfile!.lekkerNetworkId!,
              workspaceId: userProfile!.lekkerWorkspaceId!,
              message: latestText,
              sessionId: typeof bodySessionId === "string" ? bodySessionId : null,
            });
            const reply = result.reply || "Sorry, I couldn't generate a response. Please try again.";
            if (result.sessionId || result.threadId) {
              res.write(
                `data: ${JSON.stringify({ meta: { sessionId: result.sessionId || result.threadId, mode: "workspace" } })}\n\n`,
              );
            }
            res.write(`data: ${JSON.stringify({ content: reply })}\n\n`);
          }
          res.write("data: [DONE]\n\n");
          res.end();
          return;
        } catch (netErr: any) {
          console.warn("[cledwyn] Network workspace proxy failed, falling back to generalist:", netErr?.message || netErr);
          const fallbackHint =
            netErr instanceof LekkerNetworkApiError && netErr.status === 403
              ? "I couldn't open your workspace assistant (access denied). Falling back to general help — sync Lekkerpreneur in Settings if this persists.\n\n"
              : "Workspace assistant is briefly unavailable — answering generally.\n\n";
          await runGeneralist("generalist_fallback", fallbackHint);
          return;
        }
      }

      await runGeneralist("generalist");
    } catch (error) {
      console.error("CledwynAI chat error:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: "Something went wrong" })}\n\n`);
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
      const nextRaw = typeof req.query.next === "string" ? req.query.next.trim() : "";
      const next =
        nextRaw.startsWith("/app") && !nextRaw.includes("//") && !nextRaw.includes("\\")
          ? nextRaw
          : "";
      const qs = new URLSearchParams({ token });
      if (next) qs.set("next", next);
      res.json({
        token,
        url: `${base}/api/v1/mobile/establish-session?${qs.toString()}`,
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

  app.post("/api/user/age-range", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        lowerBound,
        upperBound,
        dateOfBirth,
        source,
      } = req.body || {};

      const parsedLower = lowerBound === null || lowerBound === undefined
        ? null
        : Number(lowerBound);
      const parsedUpper = upperBound === null || upperBound === undefined
        ? null
        : Number(upperBound);

      if (parsedLower != null && Number.isNaN(parsedLower)) {
        return res.status(400).json({ message: "Invalid lowerBound" });
      }
      if (parsedUpper != null && Number.isNaN(parsedUpper)) {
        return res.status(400).json({ message: "Invalid upperBound" });
      }

      const allowedSources: AgeRangeSource[] = ["apple", "google", "dob", "unknown"];
      const ageSource: AgeRangeSource = allowedSources.includes(source)
        ? source
        : dateOfBirth
          ? "dob"
          : "unknown";

      const socialMediaAllowed = isSocialMediaAllowed({
        lowerBound: parsedLower,
        upperBound: parsedUpper,
        dateOfBirth: typeof dateOfBirth === "string" ? dateOfBirth : null,
      });

      const updated = await storage.updateUser(req.user!.userId, {
        ageRangeLowerBound: parsedLower,
        ageRangeUpperBound: parsedUpper,
        dateOfBirth: typeof dateOfBirth === "string" ? dateOfBirth : undefined,
        ageRangeSource: ageSource,
        ageRangeDeclaredAt: new Date(),
        socialMediaAllowed,
      });

      if (!updated) return res.status(404).json({ message: "User not found" });
      res.json({
        socialMediaAllowed,
        user: sanitizeUser(updated),
      });
    } catch (e: any) {
      res.status(500).json({ message: e?.message || "Failed to save age range" });
    }
  });

  app.get("/api/user/social-access", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = await storage.getUser(req.user!.userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      const socialMediaAllowed = isSocialMediaAllowed({
        lowerBound: user.ageRangeLowerBound,
        upperBound: user.ageRangeUpperBound,
        dateOfBirth: user.dateOfBirth,
        socialMediaAllowed: user.socialMediaAllowed,
      });
      res.json({
        socialMediaAllowed,
        ageRangeDeclared: !!user.ageRangeDeclaredAt,
        needsAgeDeclaration: !user.ageRangeDeclaredAt && user.socialMediaAllowed == null,
      });
    } catch {
      res.status(500).json({ message: "Failed to check social access" });
    }
  });

  app.get("/api/feed", authMiddleware, requireSocialMediaAccess, async (req: AuthenticatedRequest, res: Response) => {
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

  app.get("/api/feed/:id", authMiddleware, requireSocialMediaAccess, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const post = await getFeedPostById(req.params.id);
      if (!post) return res.status(404).json({ message: "Post not found" });
      res.json({ post });
    } catch (e) {
      res.status(500).json({ message: "Failed to load post" });
    }
  });

  app.post("/api/feed", authMiddleware, requireSocialMediaAccess, async (req: AuthenticatedRequest, res: Response) => {
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

  app.post("/api/feed/:id/like", authMiddleware, requireSocialMediaAccess, async (req: AuthenticatedRequest, res: Response) => {
    try {
      await toggleFeedLike(req.params.id, req.user!.userId);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: "Failed to update like" });
    }
  });

  app.post("/api/feed/:id/share", authMiddleware, requireSocialMediaAccess, async (req: AuthenticatedRequest, res: Response) => {
    try {
      await addFeedShare(req.params.id, req.user!.userId);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: "Failed to share post" });
    }
  });

  app.post("/api/feed/:id/comments", authMiddleware, requireSocialMediaAccess, async (req: AuthenticatedRequest, res: Response) => {
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
      const { token, platform, deviceId } = req.body || {};
      if (!token || typeof token !== "string") {
        return res.status(400).json({ message: "token is required" });
      }
      // Persist Expo push token (platform optional — android | ios)
      await registerPushToken(
        req.user!.userId,
        token,
        typeof platform === "string" ? platform : typeof deviceId === "string" ? deviceId : undefined,
      );
      res.json({ ok: true });
    } catch (e) {
      console.error("Push register error:", e);
      res.status(500).json({ message: "Failed to register push token" });
    }
  });

  app.delete("/api/push/register", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { token } = req.body || {};
      await unregisterPushToken(
        req.user!.userId,
        typeof token === "string" ? token : undefined,
      );
      res.json({ ok: true });
    } catch (e) {
      console.error("Push unregister error:", e);
      res.status(500).json({ message: "Failed to unregister push token" });
    }
  });

  /** Connect API proxy — authenticated pass-through to lekker.network/api/connect */
  const connectAvailable = !!(process.env.LEKKER_WORKSPACE_ID && process.env.LEKKER_TOKEN);

  function connectGuard(_req: Request, res: Response, next: () => void) {
    if (!connectAvailable) {
      return res.status(503).json({ message: "Connect API not configured (LEKKER_WORKSPACE_ID / LEKKER_TOKEN missing)" });
    }
    next();
  }

  app.get("/api/connect/feed", authMiddleware, connectGuard, async (req: Request, res: Response) => {
    try {
      const params = req.query as Record<string, string>;
      const data = await getConnectFeed(params);
      res.json(data);
    } catch (e: any) {
      res.status(502).json({ message: e.message || "Connect feed error" });
    }
  });

  app.post("/api/connect/contacts", authMiddleware, connectGuard, async (req: Request, res: Response) => {
    try {
      const data = await submitContactToLekker(req.body);
      res.json(data);
    } catch (e: any) {
      res.status(502).json({ message: e.message || "Connect contacts error" });
    }
  });

  app.get("/api/connect/products/search", authMiddleware, connectGuard, async (req: Request, res: Response) => {
    try {
      const params = req.query as Record<string, string>;
      const data = await searchProducts(params);
      res.json(data);
    } catch (e: any) {
      res.status(502).json({ message: e.message || "Connect products error" });
    }
  });

  app.post("/api/connect/orders", authMiddleware, connectGuard, async (req: Request, res: Response) => {
    try {
      const data = await submitOrder(req.body);
      res.json(data);
    } catch (e: any) {
      res.status(502).json({ message: e.message || "Connect orders error" });
    }
  });

  app.post("/api/connect/checkout", authMiddleware, connectGuard, async (req: Request, res: Response) => {
    try {
      const data = await createCheckout(req.body);
      res.json(data);
    } catch (e: any) {
      res.status(502).json({ message: e.message || "Connect checkout error" });
    }
  });

  app.post("/api/connect/shipping/quote", authMiddleware, connectGuard, async (req: Request, res: Response) => {
    try {
      const data = await getShippingQuote(req.body);
      res.json(data);
    } catch (e: any) {
      res.status(502).json({ message: e.message || "Connect shipping error" });
    }
  });

  app.get("/api/connect/gift-cards/validate", authMiddleware, connectGuard, async (req: Request, res: Response) => {
    try {
      const code = String(req.query.code || "");
      if (!code) return res.status(400).json({ message: "code is required" });
      const data = await validateGiftCard(code);
      res.json(data);
    } catch (e: any) {
      res.status(502).json({ message: e.message || "Connect gift card error" });
    }
  });

  app.post("/api/connect/portal/request-otp", authMiddleware, connectGuard, async (req: Request, res: Response) => {
    try {
      const data = await requestPortalOtp(req.body);
      res.json(data);
    } catch (e: any) {
      res.status(502).json({ message: e.message || "Connect portal error" });
    }
  });

  app.post("/api/connect/portal/verify-otp", authMiddleware, connectGuard, async (req: Request, res: Response) => {
    try {
      const data = await verifyPortalOtp(req.body);
      res.json(data);
    } catch (e: any) {
      res.status(502).json({ message: e.message || "Connect portal verify error" });
    }
  });

  app.get("/api/connect/portal/me", authMiddleware, connectGuard, async (req: Request, res: Response) => {
    try {
      const sessionToken = String(req.query.sessionToken || "");
      if (!sessionToken) return res.status(400).json({ message: "sessionToken is required" });
      const data = await getPortalMe(sessionToken);
      res.json(data);
    } catch (e: any) {
      res.status(502).json({ message: e.message || "Connect portal me error" });
    }
  });

  // ── Bookings (events — Connect /bookings/*, retailChannel: chat) ─────────────

  function honestBookingMessage(paymentStatus: unknown, totalCents: unknown): string {
    if (paymentStatus === "paid") return "You're in — view tickets";
    if (paymentStatus === "free" || (typeof totalCents === "number" && totalCents <= 0)) {
      return "You're in";
    }
    return "Complete payment to confirm your tickets";
  }

  function handleConnectBookingError(e: unknown, res: Response, fallback: string) {
    if (e instanceof LekkerConnectError) {
      return res.status(e.status >= 400 && e.status < 600 ? e.status : 502).json({
        message: e.message || fallback,
        ...(e.body && typeof e.body === "object" ? (e.body as object) : {}),
      });
    }
    const err = e as { message?: string };
    return res.status(502).json({ message: err.message || fallback });
  }

  function inviteCodeFromBooking(req: Request, body: Record<string, unknown>): string | undefined {
    const fromQuery = typeof req.query.invite === "string" ? req.query.invite.trim() : "";
    const fromQueryCode = typeof req.query.inviteCode === "string" ? req.query.inviteCode.trim() : "";
    const fromBody =
      typeof body.inviteCode === "string"
        ? body.inviteCode.trim()
        : typeof body.invite === "string"
          ? body.invite.trim()
          : "";
    return fromBody || fromQueryCode || fromQuery || undefined;
  }

  app.get("/api/connect/bookings/offerings", authMiddleware, connectGuard, async (req: Request, res: Response) => {
    try {
      if (!isConnectConfigured()) {
        return res.status(503).json({ message: "Connect API not configured", offerings: [] });
      }
      const locationId = typeof req.query.locationId === "string" ? req.query.locationId : undefined;
      const mode = typeof req.query.mode === "string" ? req.query.mode : undefined;
      const data = await getBookingOfferings({ locationId, mode });
      res.json({ offerings: data.offerings || [] });
    } catch (e) {
      handleConnectBookingError(e, res, "Connect bookings offerings error");
    }
  });

  app.post("/api/connect/bookings", authMiddleware, connectGuard, async (req: Request, res: Response) => {
    try {
      if (!isConnectConfigured()) {
        return res.status(503).json({ message: "Connect API not configured" });
      }
      const body = (req.body || {}) as Record<string, unknown>;
      // Never trust client paymentStatus — Connect forces unpaid on public creates
      delete body.paymentStatus;

      const customerName = String(body.customerName || body.name || "").trim();
      if (!customerName) {
        return res.status(400).json({ message: "Name is required" });
      }
      const email = body.customerEmail || body.email;
      const phone = body.customerPhone || body.phone;
      if (!email && !phone) {
        return res.status(400).json({ message: "Email or phone is required" });
      }

      const selectionId =
        (typeof body.selectionId === "string" && body.selectionId) ||
        (typeof body.networkSelectionId === "string" && body.networkSelectionId) ||
        undefined;
      const inviteCode = inviteCodeFromBooking(req, body);
      const promoCode =
        typeof body.promoCode === "string" && body.promoCode.trim()
          ? body.promoCode.trim()
          : undefined;

      const result = await createBooking({
        kind: body.kind as any,
        offeringId: typeof body.offeringId === "string" ? body.offeringId : undefined,
        selectionId,
        ticketTypeId: typeof body.ticketTypeId === "string" ? body.ticketTypeId : undefined,
        quantity: body.quantity != null ? Number(body.quantity) : undefined,
        startsAt: typeof body.startsAt === "string" ? body.startsAt : undefined,
        checkInDate: typeof body.checkInDate === "string" ? body.checkInDate : undefined,
        checkOutDate: typeof body.checkOutDate === "string" ? body.checkOutDate : undefined,
        guestCheckInTime: typeof body.guestCheckInTime === "string" ? body.guestCheckInTime : undefined,
        guestCheckOutTime: typeof body.guestCheckOutTime === "string" ? body.guestCheckOutTime : undefined,
        locationId: typeof body.locationId === "string" ? body.locationId : undefined,
        customerName,
        customerEmail: email ? String(email).trim() : undefined,
        customerPhone: phone ? String(phone).trim() : undefined,
        notes: body.notes ? String(body.notes).trim() : undefined,
        promoCode,
        inviteCode,
        slotId: typeof body.slotId === "string" ? body.slotId : undefined,
        source: selectionId ? undefined : "chat",
        retailChannel: "chat",
        channelMeta: { retailChannel: "chat", claimChannel: "chat" },
      });

      const paymentStatus = result.paymentStatus;
      const totalCents = result.totalCents;
      res.status(201).json({
        bookingId: result.bookingId,
        status: result.status,
        totalCents,
        paymentStatus,
        startsAt: result.startsAt,
        endsAt: result.endsAt,
        checkInDate: result.checkInDate,
        checkOutDate: result.checkOutDate,
        tickets: result.tickets,
        networkOrderId: result.networkOrderId,
        hostWorkspaceId: result.hostWorkspaceId,
        kind: result.kind || body.kind,
        message: honestBookingMessage(paymentStatus, totalCents),
      });
    } catch (e) {
      handleConnectBookingError(e, res, "Connect bookings create error");
    }
  });

  app.post("/api/connect/bookings/checkout", authMiddleware, connectGuard, async (req: Request, res: Response) => {
    try {
      if (!isConnectConfigured()) {
        return res.status(503).json({ message: "Connect API not configured" });
      }
      const body = (req.body || {}) as Record<string, unknown>;
      delete body.paymentStatus;

      const selectionId =
        (typeof body.selectionId === "string" && body.selectionId) ||
        (typeof body.networkSelectionId === "string" && body.networkSelectionId) ||
        undefined;
      const inviteCode = inviteCodeFromBooking(req, body);
      const promoCode =
        typeof body.promoCode === "string" && body.promoCode.trim()
          ? body.promoCode.trim()
          : undefined;

      if (!body.bookingId) {
        const customerName = String(body.customerName || body.name || "").trim();
        if (!customerName) {
          return res.status(400).json({ message: "Name is required" });
        }
        const email = body.customerEmail || body.email;
        const phone = body.customerPhone || body.phone;
        if (!email && !phone) {
          return res.status(400).json({ message: "Email or phone is required" });
        }
      }

      const result = await createBookingCheckout({
        offeringId: typeof body.offeringId === "string" ? body.offeringId : undefined,
        ticketTypeId: typeof body.ticketTypeId === "string" ? body.ticketTypeId : undefined,
        quantity: body.quantity != null ? Number(body.quantity) : undefined,
        bookingId: typeof body.bookingId === "string" ? body.bookingId : undefined,
        selectionId,
        slotId: typeof body.slotId === "string" ? body.slotId : undefined,
        promoCode,
        inviteCode,
        customerName: body.customerName || body.name
          ? String(body.customerName || body.name).trim()
          : undefined,
        customerEmail: body.customerEmail || body.email
          ? String(body.customerEmail || body.email).trim()
          : undefined,
        customerPhone: body.customerPhone || body.phone
          ? String(body.customerPhone || body.phone).trim()
          : undefined,
        notes: body.notes ? String(body.notes).trim() : undefined,
        locationId: typeof body.locationId === "string" ? body.locationId : undefined,
        source: selectionId ? undefined : "chat",
        retailChannel: "chat",
        channelMeta: { retailChannel: "chat", claimChannel: "chat" },
        returnUrl: typeof body.returnUrl === "string" ? body.returnUrl : undefined,
        cancelUrl: typeof body.cancelUrl === "string" ? body.cancelUrl : undefined,
      });

      res.json({
        ...result,
        paymentUrl: result.paymentUrl || result.checkoutUrl,
        message: honestBookingMessage(result.paymentStatus, result.totalCents),
      });
    } catch (e) {
      handleConnectBookingError(e, res, "Connect bookings checkout error");
    }
  });

  app.post("/api/connect/bookings/offerings/:id/waitlist", authMiddleware, connectGuard, async (req: Request, res: Response) => {
    try {
      if (!isConnectConfigured()) {
        return res.status(503).json({ message: "Connect API not configured" });
      }
      const body = (req.body || {}) as Record<string, unknown>;
      const name = String(body.name || body.customerName || "").trim();
      if (!name) {
        return res.status(400).json({ message: "Name is required" });
      }
      const email = body.email || body.customerEmail;
      const phone = body.phone || body.customerPhone;
      if (!email && !phone) {
        return res.status(400).json({ message: "Email or phone is required" });
      }
      const result = await joinBookingWaitlist(req.params.id, {
        name,
        email: email ? String(email).trim() : undefined,
        phone: phone ? String(phone).trim() : undefined,
        ticketTypeId: typeof body.ticketTypeId === "string" ? body.ticketTypeId : undefined,
        quantity: body.quantity != null ? Number(body.quantity) : undefined,
      });
      res.status(201).json(result);
    } catch (e) {
      handleConnectBookingError(e, res, "Connect bookings waitlist error");
    }
  });

  app.post("/api/connect/bookings/claim/:token", authMiddleware, connectGuard, async (req: Request, res: Response) => {
    try {
      if (!isConnectConfigured()) {
        return res.status(503).json({ message: "Connect API not configured" });
      }
      const body = (req.body || {}) as Record<string, unknown>;
      const hostWorkspaceId =
        (typeof req.query.hostWorkspaceId === "string" && req.query.hostWorkspaceId.trim()) ||
        (typeof req.query.workspaceId === "string" && req.query.workspaceId.trim()) ||
        (typeof body.hostWorkspaceId === "string" && body.hostWorkspaceId.trim()) ||
        (typeof body.workspaceId === "string" && body.workspaceId.trim()) ||
        "";
      if (!hostWorkspaceId || !/^[a-f0-9-]{36}$/i.test(hostWorkspaceId)) {
        return res.status(400).json({
          message: "hostWorkspaceId is required (query or body) — claim runs on the host workspace",
        });
      }
      const result = await claimBookingHold(hostWorkspaceId, req.params.token, {
        claimChannel: "chat",
      });
      res.json(result);
    } catch (e) {
      handleConnectBookingError(e, res, "Connect bookings claim error");
    }
  });

  /**
   * Called by lekker.network when a provider replies on a Marketplace/Chat enquiry.
   * Auth: same shared key as Network MOBILE_API_KEY (Chat LEKKER_NETWORK_API_KEY).
   */
  app.post("/api/internal/enquiry-reply-notify", async (req: Request, res: Response) => {
    try {
      const key = req.headers["x-api-key"];
      const expected = process.env.LEKKER_NETWORK_API_KEY;
      if (!expected || !key || key !== expected) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }
      const leadId = String(req.body?.leadId || "").trim();
      const businessName = String(req.body?.businessName || "Lekkerpreneur").trim();
      const preview = String(req.body?.preview || "New reply on your enquiry").trim();
      const phone = typeof req.body?.seekerPhone === "string" ? req.body.seekerPhone.trim() : "";
      const email = typeof req.body?.seekerEmail === "string" ? req.body.seekerEmail.trim().toLowerCase() : "";

      if (!leadId || (!phone && !email)) {
        return res.status(400).json({ success: false, message: "leadId and seeker phone or email required" });
      }

      let user = phone ? await findUserByPhoneFlexible(phone) : undefined;
      if (!user && email) {
        user = await storage.getUserByEmail(email);
      }
      if (!user) {
        return res.json({ success: true, notified: false, reason: "no_chat_user" });
      }

      await notifyUserPush(user.id, businessName, preview, {
        type: "enquiry_reply",
        leadId,
      });
      return res.json({ success: true, notified: true, userId: user.id });
    } catch (e) {
      console.error("[enquiry-reply-notify]", e);
      return res.status(500).json({ success: false, message: "Failed" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
