import { apiRequest } from "@/lib/query-client";

export async function fetchConnectFeed(params?: Record<string, string>) {
  const qs = params ? `?${new URLSearchParams(params).toString()}` : "";
  const res = await apiRequest("GET", `/api/connect/feed${qs}`);
  if (!res.ok) throw new Error("Failed to load connect feed");
  return res.json();
}

export async function submitConnectContact(data: {
  name: string;
  email?: string;
  phone?: string;
  message?: string;
  sourceUrl?: string;
}) {
  const res = await apiRequest("POST", "/api/connect/contacts", data);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || "Contact submission failed");
  }
  return res.json();
}

export async function searchConnectProducts(params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  const res = await apiRequest("GET", `/api/connect/products/search?${qs}`);
  if (!res.ok) throw new Error("Product search failed");
  return res.json();
}

export async function createConnectCheckout(data: {
  items: Array<{ name: string; quantity: number; priceInCents: number }>;
  customer: { name: string; email?: string; phone?: string };
  returnUrl?: string;
  cancelUrl?: string;
}) {
  const res = await apiRequest("POST", "/api/connect/checkout", data);
  if (!res.ok) throw new Error("Checkout failed");
  return res.json();
}

export async function validateConnectGiftCard(code: string) {
  const res = await apiRequest("GET", `/api/connect/gift-cards/validate?code=${encodeURIComponent(code)}`);
  if (!res.ok) throw new Error("Gift card validation failed");
  return res.json();
}