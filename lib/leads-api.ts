import { getApiUrl } from "@/lib/query-client";
import { getAuthToken } from "@/lib/auth-token";

export type MarketplaceLeadRow = {
  id: string;
  seekerName?: string | null;
  serviceLabel?: string | null;
  serviceCategory?: string | null;
  province?: string | null;
  city?: string | null;
  suburb?: string | null;
  summary?: string | null;
  status?: string;
  createdAt?: string;
  lastMessageAt?: string | null;
  bumpedAt?: string | null;
  participationStatus?: string;
  unreadForProvider?: boolean;
  canRespond?: boolean;
  enquiryKind?: string;
  transcript?: Array<{ role?: string; content?: string; createdAt?: string }>;
  seekerPhone?: string | null;
  seekerEmail?: string | null;
  budget?: string | null;
  timeframe?: string | null;
  privacy?: {
    sharePhone?: boolean;
    shareEmail?: boolean;
    shareLocation?: boolean;
    shareBrief?: boolean;
  };
  contactSharedViaLekkerChat?: boolean;
};

export type MarketplaceLeadsResponse = {
  success?: boolean;
  leads?: MarketplaceLeadRow[];
  total?: number;
  page?: number;
  limit?: number;
  optedIn?: boolean;
  whatsappNotify?: string;
  feedScope?: "industry" | "all";
  selectedServiceCount?: number;
  message?: string;
};

function authHeaders(): HeadersInit {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function listMarketplaceLeads(opts?: {
  page?: number;
  limit?: number;
  status?: string;
  q?: string;
}): Promise<MarketplaceLeadsResponse> {
  const url = new URL("/api/marketplace-leads", getApiUrl());
  url.searchParams.set("page", String(opts?.page || 1));
  url.searchParams.set("limit", String(opts?.limit || 20));
  url.searchParams.set("status", opts?.status || "open");
  if (opts?.q) url.searchParams.set("q", opts.q);
  const res = await fetch(url.toString(), { headers: authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { success: false, leads: [], message: data.message || `HTTP ${res.status}` };
  }
  return data as MarketplaceLeadsResponse;
}

export async function getMarketplaceLeadsUnreadCount(): Promise<number> {
  try {
    const res = await fetch(new URL("/api/marketplace-leads/unread-count", getApiUrl()).toString(), {
      headers: authHeaders(),
    });
    if (!res.ok) return 0;
    const data = await res.json();
    return Number(data.count) || 0;
  } catch {
    return 0;
  }
}

export async function getMarketplaceLead(id: string): Promise<{ success?: boolean; lead?: MarketplaceLeadRow; message?: string }> {
  const res = await fetch(new URL(`/api/marketplace-leads/${encodeURIComponent(id)}`, getApiUrl()).toString(), {
    headers: authHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { success: false, message: data.message || `HTTP ${res.status}` };
  }
  return data;
}

export async function replyMarketplaceLead(
  id: string,
  content: string,
): Promise<{ success?: boolean; lead?: MarketplaceLeadRow; message?: string }> {
  const res = await fetch(new URL(`/api/marketplace-leads/${encodeURIComponent(id)}/messages`, getApiUrl()).toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ content }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { success: false, message: data.message || `HTTP ${res.status}` };
  }
  return data;
}

export async function setMarketplaceLeadStatus(
  id: string,
  status: "contacted" | "closed",
): Promise<{ success?: boolean; message?: string }> {
  const res = await fetch(new URL(`/api/marketplace-leads/${encodeURIComponent(id)}/status`, getApiUrl()).toString(), {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ status }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { success: false, message: data.message || `HTTP ${res.status}` };
  }
  return data;
}
