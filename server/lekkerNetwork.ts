const LEKKER_API_BASE = process.env.LEKKER_API_BASE_URL || (process.env.NODE_ENV === "production" ? "https://lekker.network" : "https://ba8f68e4-7053-4a89-92cd-ae1a588f2a0c-00-2ocng4z2k42dj.spock.replit.dev");
const LEKKER_API_URL = `${LEKKER_API_BASE}/api/v1/lekkerpreneurs`;
const LEKKER_SYNC_URL = `${LEKKER_API_BASE}/api/auth/sync-lekker`;
const LEKKER_WORKSPACES_URL = `${LEKKER_API_BASE}/api/v1/workspaces`;
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

export interface WorkspaceListItem {
  workspaceId: string;
  workspaceName: string;
  businessName: string;
  tradingName: string | null;
  ownerName: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  logoUrl: string | null;
  category: string | null;
  province: string | null;
  currency: string;
  shippingEnabled: boolean;
  paymentUrl: string | null;
  isVatVendor: boolean;
  financialYearEndMonth: number | null;
  isVerified: boolean;
  plan: string;
  billingStatus: string;
  createdAt: string;
}

export interface WorkspaceDetail extends WorkspaceListItem {
  trialEndsAt: string | null;
  planExpiresAt: string | null;
  verifiedDomains: string[];
  teamSize: number;
  activeServices: { serviceType: string; status: string }[];
}

export interface LekkerNetworkEntry {
  id: string;
  workspaceId?: string;
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
  directoryCategory?: string;
  servicesOffered?: string;
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

interface WorkspacesResponse {
  success: boolean;
  total: number;
  page: number;
  limit: number;
  data: WorkspaceListItem[];
}

interface WorkspaceDetailResponse {
  success: boolean;
  workspace: WorkspaceDetail;
}

interface LekkerSyncResponse {
  matched: boolean;
  message?: string;
  user?: LekkerNetworkEntry & {
    workspaceId?: string;
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

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T | null> {
  if (!LEKKER_API_KEY) {
    console.warn("LEKKER_NETWORK_API_KEY not set, skipping Lekker Network API call");
    return null;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url, {
      ...options,
      headers: {
        "X-API-Key": LEKKER_API_KEY,
        "Content-Type": "application/json",
        "Accept": "application/json",
        ...(options?.headers || {}),
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.error(`Lekker Network API error: ${response.status} ${response.statusText} — ${url}`);
      return null;
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      console.warn(`Lekker Network API returned non-JSON: ${contentType}`);
      return null;
    }

    return await response.json() as T;
  } catch (error: any) {
    if (error.name === "AbortError") {
      console.error(`Lekker Network API request timed out — ${url}`);
    } else {
      console.error(`Lekker Network API error: ${error.message}`);
    }
    return null;
  }
}

async function fetchFromApi(params: Record<string, string>): Promise<LekkerNetworkResponse | null> {
  const url = new URL(LEKKER_API_URL);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return apiFetch<LekkerNetworkResponse>(url.toString());
}

async function syncWithLekkerNetwork(email: string, phone: string): Promise<LekkerSyncResponse | null> {
  const body: Record<string, string> = {};
  if (email && email.includes("@")) {
    body.email = email.toLowerCase().trim();
  }
  if (phone) {
    body.phone = normalizePhone(phone);
  }
  return apiFetch<LekkerSyncResponse>(LEKKER_SYNC_URL, {
    method: "POST",
    body: JSON.stringify(body),
  });
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

export async function fetchWorkspaces(params: {
  page?: number;
  limit?: number;
  search?: string;
  province?: string;
  category?: string;
  sort?: string;
}): Promise<WorkspacesResponse | null> {
  const url = new URL(LEKKER_WORKSPACES_URL);
  if (params.page) url.searchParams.set("page", String(params.page));
  if (params.limit) url.searchParams.set("limit", String(params.limit));
  if (params.search) url.searchParams.set("search", params.search);
  if (params.province) url.searchParams.set("province", params.province);
  if (params.category) url.searchParams.set("category", params.category);
  if (params.sort) url.searchParams.set("sort", params.sort);
  return apiFetch<WorkspacesResponse>(url.toString());
}

export async function fetchWorkspaceById(workspaceId: string): Promise<WorkspaceDetail | null> {
  const result = await apiFetch<WorkspaceDetailResponse>(`${LEKKER_WORKSPACES_URL}/${workspaceId}`);
  return result?.workspace || null;
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
    lekkerWorkspaceId: entry.workspaceId || entry.workspace?.id || null,
    isVerifiedLekkerpreneur: true,
    lekkerNetworkAccess: true,
    businessCategory: ws.category || entry.category || null,
    businessWebsite: ws.businessWebsite || ws.websiteUrl || entry.website || null,
    businessLogoUrl: ws.logoUrl || entry.logoUrl || null,
    businessProvince: ws.province || entry.province || entry.location?.province || null,
    businessCountry: entry.location?.country || "South Africa",
    lekkerVerifiedAt: new Date(),
  };
}

const LEKKER_MOBILE_BASE = process.env.LEKKER_API_BASE_URL || "https://lekker.network";

async function lekkerMobileFetch<T>(path: string, init?: RequestInit): Promise<T | null> {
  if (!LEKKER_API_KEY) return null;
  try {
    const res = await fetch(`${LEKKER_MOBILE_BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": LEKKER_API_KEY,
        ...(init?.headers || {}),
      },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchMobileSessionToken(lekkerNetworkUserId: string): Promise<string | null> {
  const data = await lekkerMobileFetch<{ token?: string }>("/api/v1/mobile/session-token", {
    method: "POST",
    body: JSON.stringify({ userId: lekkerNetworkUserId }),
  });
  return data?.token || null;
}

export async function fetchWorkspaceEmailStatus(
  workspaceId: string,
): Promise<{ active: boolean; unreadCount?: number }> {
  const data = await lekkerMobileFetch<{ active: boolean; unreadCount?: number }>(
    `/api/v1/mobile/email/status?workspaceId=${encodeURIComponent(workspaceId)}`,
  );
  return data || { active: false };
}

export async function fetchMobileEmailThreads(
  workspaceId: string,
  page = 1,
): Promise<{ threads: Array<{ id: string; subject: string; snippet: string; fromName: string; unread: boolean; updatedAt: string }> } | null> {
  return lekkerMobileFetch(
    `/api/v1/mobile/email/threads?workspaceId=${encodeURIComponent(workspaceId)}&page=${page}`,
  );
}

export async function fetchMobileEmailThread(
  workspaceId: string,
  threadId: string,
): Promise<{
  subject: string;
  messages: Array<{
    id: string;
    from: string;
    fromAddress: string;
    bodyText: string;
    createdAt: string;
    isOutbound: boolean;
  }>;
} | null> {
  return lekkerMobileFetch(
    `/api/v1/mobile/email/threads/${threadId}?workspaceId=${encodeURIComponent(workspaceId)}`,
  );
}

export async function sendMobileEmail(
  workspaceId: string,
  userId: string,
  payload: {
    to: string | string[];
    subject: string;
    bodyText: string;
    inReplyTo?: string;
    references?: string;
  },
): Promise<{ messageId: string; threadId: string } | null> {
  const to = Array.isArray(payload.to) ? payload.to : [payload.to];
  return lekkerMobileFetch("/api/v1/mobile/email/send", {
    method: "POST",
    body: JSON.stringify({
      workspaceId,
      userId,
      to,
      subject: payload.subject,
      bodyText: payload.bodyText,
      inReplyTo: payload.inReplyTo,
      references: payload.references,
    }),
  });
}

export function buildSyncUserResponse(entry: LekkerNetworkEntry) {
  const ws = resolveWorkspace(entry);
  return {
    id: entry.id,
    workspaceId: entry.workspaceId || null,
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
    workspaceId: d.workspaceId || null,
    name: d.ownerName || d.businessName || "Unknown",
    businessName: d.businessName || d.ownerName || "Unknown Business",
    tradingName: ws.tradingName || "",
    serviceType: d.directoryCategory || ws.category || "General",
    location: ws.province || d.location?.province || "South Africa",
    province: ws.province || d.location?.province || "",
    phone: ws.businessPhone || d.phone || "",
    email: ws.businessEmail || d.email || "",
    bio: d.servicesOffered || "",
    avatarColor: "#F5B800",
    website: ws.businessWebsite || ws.websiteUrl || d.website || "",
    logoUrl: ws.logoUrl || d.logoUrl || "",
    isVerified: ws.isVerified ?? d.isVerified ?? false,
    emailVerified: d.emailVerified ?? false,
    memberSince: d.memberSince || d.createdAt || "",
    workspace: ws,
  };
}

export function buildWorkspaceDirectoryEntry(ws: WorkspaceListItem) {
  return {
    id: ws.workspaceId,
    workspaceId: ws.workspaceId,
    name: ws.ownerName || ws.businessName || "Unknown",
    businessName: ws.businessName || ws.workspaceName || "Unknown Business",
    tradingName: ws.tradingName || "",
    serviceType: ws.category || "General",
    location: ws.province || "South Africa",
    province: ws.province || "",
    phone: ws.phone || "",
    email: ws.email || "",
    bio: "",
    avatarColor: "#F5B800",
    website: ws.website || "",
    logoUrl: ws.logoUrl || "",
    isVerified: ws.isVerified ?? false,
    currency: ws.currency || "ZAR",
    plan: ws.plan || "Free",
    billingStatus: ws.billingStatus || "free",
    shippingEnabled: ws.shippingEnabled ?? false,
    paymentUrl: ws.paymentUrl || "",
    isVatVendor: ws.isVatVendor ?? false,
    financialYearEndMonth: ws.financialYearEndMonth,
    memberSince: ws.createdAt || "",
  };
}
