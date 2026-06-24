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

const BASE = `https://lekker.network/api/connect/${WID}`;

async function call(path: string, method = 'GET', body?: any, extraHeaders?: any) {
  const url = `${BASE}${path}${path.includes('?') ? '&' : '?'}token=${TOKEN}`;
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Lekker API ${res.status}: ${text}`);
  }
  return res.json();
}

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
