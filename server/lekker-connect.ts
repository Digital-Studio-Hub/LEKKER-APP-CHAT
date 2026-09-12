/**
 * Lekker Network Connect API - Standard Connector
 * Per the provided API documentation.
 *
 * Set these env vars:
 * LEKKER_WORKSPACE_ID=...
 * LEKKER_TOKEN=...
 *
 * Usage in routes:
 * import { submitContactToLekker, getFeed, createCheckout } from './lekker-connect';
 */

const WID = process.env.LEKKER_WORKSPACE_ID;
const TOKEN = process.env.LEKKER_TOKEN;

if (!WID || !TOKEN) {
  console.warn('LEKKER_WORKSPACE_ID or LEKKER_TOKEN not set - Connect API calls will fail');
}

export function isConnectConfigured(): boolean {
  return Boolean(WID && TOKEN);
}

export class LekkerConnectError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: unknown,
  ) {
    super(message);
    this.name = "LekkerConnectError";
  }
}

async function callConnectWorkspace(
  workspaceId: string,
  path: string,
  method: "GET" | "POST" | "PATCH" = "GET",
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<any> {
  if (!TOKEN) {
    throw new LekkerConnectError(
      "Lekker Connect API is not configured. Set LEKKER_WORKSPACE_ID and LEKKER_TOKEN.",
      503,
    );
  }
  const base = `https://lekker.network/api/connect/${workspaceId}`;
  const separator = path.includes("?") ? "&" : "?";
  const url =
    method === "GET"
      ? `${base}${path}${separator}token=${encodeURIComponent(TOKEN)}`
      : `${base}${path}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...extraHeaders,
  };
  if (method === "POST" || method === "PATCH") {
    headers.Authorization = `Bearer ${TOKEN}`;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text };
  }

  if (!res.ok) {
    const err = data as { error?: string; message?: string };
    throw new LekkerConnectError(
      err.message || err.error || `Lekker API ${res.status}`,
      res.status,
      data,
    );
  }

  return data;
}

async function call(path: string, method: "GET" | "POST" | "PATCH" = "GET", body?: any, extraHeaders?: any) {
  if (!WID) {
    throw new LekkerConnectError(
      "Lekker Connect API is not configured. Set LEKKER_WORKSPACE_ID and LEKKER_TOKEN.",
      503,
    );
  }
  return callConnectWorkspace(WID, path, method, body, extraHeaders);
}

export { callConnectWorkspace };

export async function submitContactToLekker(data: {
  name: string;
  email?: string;
  phone?: string;
  message?: string;
  sourceUrl?: string;
}) {
  return call('/contacts', 'POST', data);
}

export async function getFeed(params: Record<string, string | boolean> = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => qs.append(k, String(v)));
  return call(`/feed?${qs.toString()}`);
}

export async function searchProducts(params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params);
  return call(`/products/search?${qs.toString()}`);
}

export async function submitOrder(order: any) {
  return call('/orders', 'POST', order);
}

export async function createCheckout(data: {
  items: Array<{ name: string; quantity: number; priceInCents: number }>;
  customer: { name: string; email?: string; phone?: string };
  returnUrl?: string;
  cancelUrl?: string;
}) {
  return call('/checkout', 'POST', data);
}

export async function getShippingQuote(data: any) {
  return call('/shipping/quote', 'POST', data);
}

export async function validateGiftCard(code: string) {
  return call(`/gift-cards/validate?code=${encodeURIComponent(code)}`);
}

// Portal
export async function requestPortalOtp(data: { email?: string; phone?: string; channel: 'email' | 'whatsapp' }) {
  return call('/portal/request-otp', 'POST', data);
}

export async function verifyPortalOtp(data: { email?: string; phone?: string; code: string }) {
  return call('/portal/verify-otp', 'POST', data);
}

export async function getPortalMe(sessionToken: string) {
  return call('/portal/me', 'GET', undefined, { 'X-Portal-Token': sessionToken });
}

// ── Bookings (events / stays via Connect) ─────────────────────────────────────

export async function getBookingOfferings(params: {
  locationId?: string;
  mode?: string;
} = {}): Promise<{ offerings: any[] }> {
  const qs = new URLSearchParams();
  if (params.locationId) qs.set("locationId", params.locationId);
  if (params.mode) qs.set("mode", params.mode);
  const q = qs.toString();
  return call(`/bookings/offerings${q ? `?${q}` : ""}`);
}

/** Alias — event ticket browsing uses Connect bookings offerings list. */
export async function getBookingFeed(params: {
  locationId?: string;
  mode?: string;
} = {}) {
  return getBookingOfferings(params);
}

export async function createBooking(data: {
  kind?: "appointment" | "session" | "event_ticket" | "event" | "stay";
  offeringId?: string;
  selectionId?: string;
  ticketTypeId?: string;
  quantity?: number;
  startsAt?: string;
  checkInDate?: string;
  checkOutDate?: string;
  guestCheckInTime?: string;
  guestCheckOutTime?: string;
  locationId?: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  notes?: string;
  promoCode?: string;
  inviteCode?: string;
  slotId?: string;
  source?: string;
  retailChannel?: string;
  channelMeta?: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  // Never forward client paymentStatus — Connect forces unpaid on public creates
  const { paymentStatus: _ignored, ...safe } = data as typeof data & { paymentStatus?: string };
  void _ignored;
  return call("/bookings", "POST", safe);
}

/** Connect public booking checkout (create+pay or pay-existing via bookingId). */
export async function createBookingCheckout(data: {
  offeringId?: string;
  ticketTypeId?: string;
  quantity?: number;
  bookingId?: string;
  selectionId?: string;
  slotId?: string;
  promoCode?: string;
  inviteCode?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  notes?: string;
  locationId?: string;
  source?: string;
  retailChannel?: string;
  channelMeta?: Record<string, unknown>;
  returnUrl?: string;
  cancelUrl?: string;
}): Promise<Record<string, unknown>> {
  return call("/bookings/checkout", "POST", {
    ...data,
    retailChannel: data.retailChannel || "chat",
  });
}

export async function joinBookingWaitlist(
  offeringId: string,
  data: {
    name?: string;
    email?: string;
    phone?: string;
    ticketTypeId?: string;
    quantity?: number;
  },
): Promise<Record<string, unknown>> {
  return call(
    `/bookings/offerings/${encodeURIComponent(offeringId)}/waitlist`,
    "POST",
    data,
  );
}

/** Claim a waitlist hold — host workspace owns the booking. */
export async function claimBookingHold(
  hostWorkspaceId: string,
  token: string,
  data: { claimChannel?: string } = {},
): Promise<Record<string, unknown>> {
  return callConnectWorkspace(
    hostWorkspaceId,
    `/bookings/claim/${encodeURIComponent(token)}`,
    "POST",
    {
      claimChannel: data.claimChannel || "chat",
    },
  );
}
