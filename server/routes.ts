import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import OpenAI from "openai";
import rateLimit, { type Options } from "express-rate-limit";
import { registerSchema, loginSchema, updateProfileSchema } from "@shared/schema";
import { storage } from "./storage";
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
import { findLekkerpreneurByPhoneOrEmail, fetchDirectory as fetchLekkerDirectory, fetchLekkerpreneurById, extractLekkerpreneurProfile, type LekkerNetworkEntry } from "./lekkerNetwork";

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

export async function registerRoutes(app: Express): Promise<Server> {

  app.post("/api/auth/register", registerLimiter, async (req: Request, res: Response) => {
    try {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        const errors = parsed.error.errors.map(e => ({ field: e.path.join("."), message: e.message }));
        return res.status(400).json({ message: "Validation failed", errors });
      }

      const { phone, email, username, firstName, lastName, password } = parsed.data;

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
        phoneVerified: false,
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
        const entries = apiResult.data.map((d) => ({
          id: d.id,
          name: d.ownerName,
          businessName: d.businessName,
          tradingName: d.tradingName || "",
          serviceType: d.category || "",
          location: d.location?.province || "",
          province: d.location?.province || "",
          phone: d.phone,
          email: d.email,
          bio: "",
          avatarColor: "#F5B800",
          website: d.website || "",
          logoUrl: d.logoUrl || "",
          isVerified: d.isVerified,
        }));

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
          id: apiEntry.id,
          name: apiEntry.ownerName,
          businessName: apiEntry.businessName,
          tradingName: apiEntry.tradingName || "",
          serviceType: apiEntry.category || "",
          location: apiEntry.location?.province || "",
          province: apiEntry.location?.province || "",
          phone: apiEntry.phone,
          email: apiEntry.email,
          bio: "",
          avatarColor: "#F5B800",
          website: apiEntry.website || "",
          logoUrl: apiEntry.logoUrl || "",
          isVerified: apiEntry.isVerified,
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
          businessName: match.businessName,
          website: match.website || "",
          verifiedLinks: match.website ? [match.website] : [],
          name: match.ownerName,
          phone: match.phone,
          isVerified: match.isVerified,
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

      res.json({ matched: true, user: sanitizeUser(updated || user) });
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

  app.post("/api/cledwyn/chat", async (req: Request, res: Response) => {
    try {
      const { messages, lekkerNetworkAccess } = req.body;

      const systemPrompt = lekkerNetworkAccess
        ? `You are CledwynAI, a smart and friendly AI assistant for Lekker Network - a business platform for entrepreneurs (Lekkerpreneurs). You help with business advice, product recommendations, service quotes, marketing strategies, and general business operations. You are knowledgeable, professional yet approachable, and always aim to help entrepreneurs succeed. Keep responses concise and actionable. When asked about products or services, suggest checking the Lekker Marketplace.`
        : `You are a helpful, friendly, and knowledgeable AI assistant. You can help with any topic — general knowledge, creative writing, coding, math, science, daily life tips, recommendations, and more. You are conversational, concise, and always aim to be useful. Keep your tone warm and approachable.`;

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
