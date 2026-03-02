const LEKKER_API_BASE = "https://lekker.network";
const LEKKER_API_URL = `${LEKKER_API_BASE}/api/v1/lekkerpreneurs`;
const LEKKER_SYNC_URL = `${LEKKER_API_BASE}/api/auth/sync-lekker`;
const LEKKER_API_KEY = process.env.LEKKER_NETWORK_API_KEY || "";

export interface LekkerWorkspace {
  id?: string;
  name?: string;
  currency?: string;
  shippingEnabled?: boolean;
  paymentUrl?: string;
  websiteUrl?: string;
  businessName?: string;
  tradingName?: string;
  businessAddress?: string;
  businessPhone?: string;
  businessEmail?: string;
  businessWebsite?: string;
  logoUrl?: string;
  category?: string;
  province?: string;
  website?: string;
  isVatVendor?: boolean;
  defaultVatStatus?: string;
  invoiceNumberPrefix?: string;
  quoteNumberPrefix?: string;
  financialYearEndMonth?: number;
  isVerified?: boolean;
}

export interface LekkerNetworkEntry {
  id: string;
  name?: string;
  businessName: string;
  tradingName?: string;
  ownerName?: string;
  phone?: string;
  businessPhone?: string;
  email: string;
  businessEmail?: string;
  emailVerified?: boolean;
  memberSince?: string;
  logoUrl?: string;
  category?: string;
  website?: string;
  province?: string;
  location?: {
    province: string;
    country: string;
  };
  isVerified: boolean;
  createdAt?: string;
  workspaceCreatedAt?: string;
  workspace?: LekkerWorkspace;
}

interface LekkerNetworkResponse {
  success?: boolean;
  total: number;
  page: number;
  limit: number;
  data: LekkerNetworkEntry[];
}

interface LekkerSyncResponse {
  matched: boolean;
  message?: string;
  user?: LekkerNetworkEntry & {
    workspace?: LekkerWorkspace;
  };
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  if (digits.startsWith("0") && digits.length === 10) {
    return "+27" + digits.substring(1);
  }
  if (!digits.startsWith("+") && digits.length >= 9) {
    return "+" + digits;
  }
  return digits;
}

async function fetchFromApi(params: Record<string, string>): Promise<LekkerNetworkResponse | null> {
  if (!LEKKER_API_KEY) {
    console.warn("LEKKER_NETWORK_API_KEY not set, skipping Lekker Network API call");
    return null;
  }

  const url = new URL(LEKKER_API_URL);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url.toString(), {
      headers: {
        "X-API-Key": LEKKER_API_KEY,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.error(`Lekker Network API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      console.warn(`Lekker Network API returned non-JSON content-type: ${contentType}. API may not be live yet.`);
      return null;
    }

    return await response.json() as LekkerNetworkResponse;
  } catch (error: any) {
    if (error.name === "AbortError") {
      console.error("Lekker Network API request timed out");
    } else {
      console.error("Lekker Network API error:", error.message);
    }
    return null;
  }
}

async function syncWithLekkerNetwork(email: string, phone: string): Promise<LekkerSyncResponse | null> {
  if (!LEKKER_API_KEY) {
    console.warn("LEKKER_NETWORK_API_KEY not set, skipping sync");
    return null;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const body: Record<string, string> = {};
    if (email && email.includes("@")) {
      body.email = email.toLowerCase().trim();
    }
    if (phone) {
      body.phone = normalizePhone(phone);
    }

    const response = await fetch(LEKKER_SYNC_URL, {
      method: "POST",
      headers: {
        "X-API-Key": LEKKER_API_KEY,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.error(`Lekker sync API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      console.warn(`Lekker sync API returned non-JSON: ${contentType}`);
      return null;
    }

    return await response.json() as LekkerSyncResponse;
  } catch (error: any) {
    if (error.name === "AbortError") {
      console.error("Lekker sync API request timed out");
    } else {
      console.error("Lekker sync API error:", error.message);
    }
    return null;
  }
}

export async function findLekkerpreneurByPhoneOrEmail(
  phone: string,
  email: string
): Promise<LekkerNetworkEntry | null> {
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

export async function fetchDirectory(params: {
  page?: number;
  limit?: number;
  search?: string;
  location?: string;
  category?: string;
  sort?: string;
}): Promise<LekkerNetworkResponse | null> {
  const queryParams: Record<string, string> = {};
  if (params.page) queryParams.page = String(params.page);
  if (params.limit) queryParams.limit = String(params.limit);
  if (params.search) queryParams.search = params.search;
  if (params.location) queryParams.location = params.location;
  if (params.category) queryParams.category = params.category;
  if (params.sort) queryParams.sort = params.sort;

  return fetchFromApi(queryParams);
}

export async function fetchLekkerpreneurById(id: string): Promise<LekkerNetworkEntry | null> {
  const result = await fetchFromApi({ search: id, limit: "20" });
  if (result?.data?.length) {
    const match = result.data.find((entry) => entry.id === id);
    if (match) return match;
  }
  return null;
}

function resolveWorkspace(entry: LekkerNetworkEntry): LekkerWorkspace {
  const ws = entry.workspace || {};
  return {
    id: ws.id || undefined,
    name: ws.name || undefined,
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
    isVerified: ws.isVerified ?? entry.isVerified ?? false,
  };
}

export function extractLekkerpreneurProfile(entry: LekkerNetworkEntry) {
  const ws = resolveWorkspace(entry);
  return {
    businessName: ws.businessName || entry.businessName,
    tradingName: ws.tradingName || entry.tradingName || null,
    lekkerNetworkId: entry.id,
    isVerifiedLekkerpreneur: true,
    businessCategory: ws.category || entry.category || null,
    businessWebsite: ws.businessWebsite || ws.websiteUrl || entry.website || null,
    businessLogoUrl: ws.logoUrl || entry.logoUrl || null,
    businessProvince: ws.province || entry.province || entry.location?.province || null,
    businessCountry: entry.location?.country || "South Africa",
    lekkerVerifiedAt: new Date(),
  };
}

export function buildSyncUserResponse(entry: LekkerNetworkEntry) {
  const ws = resolveWorkspace(entry);
  return {
    id: entry.id,
    name: entry.ownerName || entry.name || entry.businessName || "Unknown",
    email: entry.email || "",
    emailVerified: entry.emailVerified ?? false,
    memberSince: entry.memberSince || entry.createdAt || "",
    workspace: ws,
  };
}

export function buildDirectoryEntry(d: LekkerNetworkEntry) {
  const ws = resolveWorkspace(d);
  return {
    id: d.id,
    name: d.ownerName || d.businessName || "Unknown",
    businessName: d.businessName || d.ownerName || "Unknown Business",
    tradingName: ws.tradingName || "",
    serviceType: ws.category || "General",
    location: ws.province || d.location?.province || "South Africa",
    province: ws.province || d.location?.province || "",
    phone: ws.businessPhone || d.phone || "",
    email: ws.businessEmail || d.email || "",
    bio: "",
    avatarColor: "#F5B800",
    website: ws.businessWebsite || ws.websiteUrl || d.website || "",
    logoUrl: ws.logoUrl || d.logoUrl || "",
    isVerified: ws.isVerified ?? d.isVerified ?? false,
    emailVerified: d.emailVerified ?? false,
    memberSince: d.memberSince || d.createdAt || "",
    workspace: ws,
  };
}
