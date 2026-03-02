const LEKKER_API_URL = process.env.LEKKER_NETWORK_API_URL || "https://lekker.network/api/v1/lekkerpreneurs";
const LEKKER_API_KEY = process.env.LEKKER_NETWORK_API_KEY || "";

export interface LekkerNetworkEntry {
  id: string;
  businessName: string;
  tradingName?: string;
  ownerName: string;
  phone: string;
  email: string;
  logoUrl?: string;
  category: string;
  website?: string;
  location: {
    province: string;
    country: string;
  };
  isVerified: boolean;
  createdAt: string;
}

interface LekkerNetworkResponse {
  success: boolean;
  total: number;
  page: number;
  limit: number;
  data: LekkerNetworkEntry[];
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

export async function findLekkerpreneurByPhoneOrEmail(
  phone: string,
  email: string
): Promise<LekkerNetworkEntry | null> {
  const normalizedPhone = normalizePhone(phone);
  const normalizedEmail = email.toLowerCase().trim();

  if (normalizedPhone) {
    const phoneResult = await fetchFromApi({ search: normalizedPhone, limit: "10" });
    if (phoneResult?.data?.length) {
      const phoneMatch = phoneResult.data.find(
        (entry) => normalizePhone(entry.phone) === normalizedPhone
      );
      if (phoneMatch) return phoneMatch;
    }
  }

  if (normalizedEmail && normalizedEmail.includes("@")) {
    const emailResult = await fetchFromApi({ search: normalizedEmail, limit: "10" });
    if (emailResult?.data?.length) {
      const emailMatch = emailResult.data.find(
        (entry) => entry.email?.toLowerCase().trim() === normalizedEmail
      );
      if (emailMatch) return emailMatch;
    }
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
    isVerifiedLekkerpreneur: entry.isVerified,
    businessCategory: entry.category || null,
    businessWebsite: entry.website || null,
    businessLogoUrl: entry.logoUrl || null,
    businessProvince: entry.location?.province || null,
    businessCountry: entry.location?.country || "South Africa",
    lekkerVerifiedAt: entry.isVerified ? new Date() : null,
  };
}
