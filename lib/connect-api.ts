import { getApiUrl } from "@/lib/query-client";
import { getAuthToken } from "@/lib/auth-token";

async function connectFetch(path: string, method = "GET", body?: unknown): Promise<any> {
  const baseUrl = getApiUrl();
  const token = getAuthToken();
  const res = await fetch(`${baseUrl}api/connect${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || `Connect API error ${res.status}`);
  }
  return res.json();
}

export function getFeed(params: Record<string, string | boolean> = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => qs.append(k, String(v)));
  return connectFetch(`/feed?${qs.toString()}`);
}

export function submitContact(data: {
  name: string;
  email?: string;
  phone?: string;
  message?: string;
  sourceUrl?: string;
}) {
  return connectFetch("/contacts", "POST", data);
}

export function searchProducts(params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params);
  return connectFetch(`/products/search?${qs.toString()}`);
}

export function submitOrder(order: unknown) {
  return connectFetch("/orders", "POST", order);
}

export function createCheckout(data: {
  items: Array<{ name: string; quantity: number; priceInCents: number }>;
  customer: { name: string; email?: string; phone?: string };
  returnUrl?: string;
  cancelUrl?: string;
}) {
  return connectFetch("/checkout", "POST", data);
}

export function getShippingQuote(data: unknown) {
  return connectFetch("/shipping/quote", "POST", data);
}

export function validateGiftCard(code: string) {
  return connectFetch(`/gift-cards/validate?code=${encodeURIComponent(code)}`);
}

export function requestPortalOtp(data: { email?: string; phone?: string; channel: "email" | "whatsapp" }) {
  return connectFetch("/portal/request-otp", "POST", data);
}

export function verifyPortalOtp(data: { email?: string; phone?: string; code: string }) {
  return connectFetch("/portal/verify-otp", "POST", data);
}

export function getPortalMe(sessionToken: string) {
  return connectFetch(`/portal/me?sessionToken=${encodeURIComponent(sessionToken)}`);
}
