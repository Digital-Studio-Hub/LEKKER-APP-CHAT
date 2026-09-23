import { getApiUrl } from "@/lib/query-client";
import { getAuthToken } from "@/lib/auth-token";
import { LEKKER_NETWORK_URL } from "@/constants/ecosystem";

/**
 * Mint Network SSO URL for Software WebView.
 * Optional `next` must be a relative /app path (e.g. /app/marketplace-leads).
 */
export async function fetchLekkerSoftwareUrl(next?: string): Promise<string> {
  try {
    const baseUrl = getApiUrl();
    const token = getAuthToken();
    const qs = new URLSearchParams();
    if (next && next.startsWith("/app") && !next.includes("//")) {
      qs.set("next", next);
    }
    const path = `api/lekker/session-token${qs.toString() ? `?${qs}` : ""}`;
    const res = await fetch(`${baseUrl}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error("session-token failed");
    const data = await res.json();
    return (data.url as string) || LEKKER_NETWORK_URL;
  } catch {
    if (next && next.startsWith("/app")) return `${LEKKER_NETWORK_URL}${next}`;
    return LEKKER_NETWORK_URL;
  }
}

export const SOFTWARE_SHORTCUTS = [
  { id: "home", label: "Home", next: "/app", icon: "home-outline" as const },
  { id: "website", label: "Website", next: "/app/website-manager", icon: "globe-outline" as const },
  { id: "mail", label: "Mail", next: "/app/mail", icon: "mail-outline" as const },
  { id: "tasks", label: "Tasks", next: "/app/tasks", icon: "checkbox-outline" as const },
  { id: "leads", label: "Leads", next: "/app/marketplace-leads", icon: "briefcase-outline" as const },
  { id: "bookings", label: "Bookings", next: "/app/bookings", icon: "calendar-outline" as const },
  { id: "invoices", label: "Invoices", next: "/app/invoices", icon: "document-text-outline" as const },
  // Open Chat's own Cledwyn tab — not Network /app/cledwyn inside the WebView
  {
    id: "cledwyn",
    label: "Cledwyn",
    next: "/app/cledwyn",
    icon: "sparkles-outline" as const,
    native: "/(tabs)/cledwyn",
  },
] as const;
