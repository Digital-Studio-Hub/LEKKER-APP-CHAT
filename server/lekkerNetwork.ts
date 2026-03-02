const LEKKER_API_BASE = "https://lekker.network";
const LEKKER_API_URL = `${LEKKER_API_BASE}/api/v1/lekkerpreneurs`;
const LEKKER_SYNC_URL = `${LEKKER_API_BASE}/api/auth/sync-lekker`;
const LEKKER_API_KEY = process.env.LEKKER_NETWORK_API_KEY || "";

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
  user?: LekkerNetworkEntry;
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

export function extractLekkerpreneurProfile(entry: LekkerNetworkEntry) {
  return {
    businessName: entry.businessName,
    tradingName: entry.tradingName || null,
    lekkerNetworkId: entry.id,
    isVerifiedLekkerpreneur: true,
    businessCategory: entry.category || null,
    businessWebsite: entry.website || null,
    businessLogoUrl: entry.logoUrl || null,
    businessProvince: entry.province || entry.location?.province || null,
    businessCountry: entry.location?.country || "South Africa",
    lekkerVerifiedAt: new Date(),
  };
}
