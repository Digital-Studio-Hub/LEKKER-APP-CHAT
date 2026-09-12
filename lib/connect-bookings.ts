/**
 * Thin client wrappers for Chat → Connect booking proxies.
 * Prefer Marketplace webview for multi-host browsing; these support future native UI.
 */
import { getApiUrl } from "@/lib/query-client";
import { getAuthToken } from "@/lib/auth-token";

async function bookingsFetch(path: string, method = "GET", body?: unknown): Promise<any> {
  const baseUrl = getApiUrl();
  const token = getAuthToken();
  const res = await fetch(`${baseUrl}api/connect/bookings${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || `Connect bookings error ${res.status}`);
  }
  return res.json();
}

export function getBookingOfferings(params: { locationId?: string; mode?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.locationId) qs.set("locationId", params.locationId);
  if (params.mode) qs.set("mode", params.mode);
  const q = qs.toString();
  return bookingsFetch(`/offerings${q ? `?${q}` : ""}`);
}

export function createBooking(data: Record<string, unknown>) {
  return bookingsFetch("", "POST", data);
}

export function createBookingCheckout(data: Record<string, unknown>) {
  return bookingsFetch("/checkout", "POST", data);
}

export function joinBookingWaitlist(
  offeringId: string,
  data: {
    name?: string;
    email?: string;
    phone?: string;
    ticketTypeId?: string;
    quantity?: number;
  },
) {
  return bookingsFetch(`/offerings/${encodeURIComponent(offeringId)}/waitlist`, "POST", data);
}

export function claimBookingHold(
  token: string,
  hostWorkspaceId: string,
  data: { claimChannel?: string } = {},
) {
  const qs = new URLSearchParams({ hostWorkspaceId });
  return bookingsFetch(`/claim/${encodeURIComponent(token)}?${qs}`, "POST", data);
}
