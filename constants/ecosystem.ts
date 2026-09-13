/** Ecosystem URLs for Browse tab shortcuts */
export const LEKKER_MARKETPLACE_SHOP_URL = "https://lekkermarketplace.com/shop";
export const LEKKER_MARKETPLACE_EVENTS_URL = "https://lekkermarketplace.com/events";
export const LEKKER_SOCIAL_URL = "https://lekker.social";
export const LEKKER_NETWORK_URL = "https://lekker.network";
export const LEKKER_PAYLEKKER_URL = "https://lekker.network/paylekker";
export const LEKKER_UNIVERSITY_URL = "https://lekkeruniversity.co.za";
export const LEKKER_WEBSITE_URL = "https://lekker.website";
export const LEKKER_CHAT_WEB_URL = "https://chat.lekker.network";
export const LEKKER_CHAT_PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.lekker.chat";
export const GOOGLE_SEARCH_URL = "https://www.google.com/search?q=";

/** Native in-app route (not a URL) — Browse handles specially */
export const NATIVE_EVENTS_ROUTE = "/events";

export const ECOSYSTEM_SHORTCUTS = [
  {
    id: "marketplace",
    title: "Lekker Marketplace",
    subtitle: "Shop local products & services",
    url: LEKKER_MARKETPLACE_SHOP_URL,
    icon: "cart-outline" as const,
    color: "#F5B800",
  },
  {
    id: "network",
    title: "lekker.network",
    subtitle: "Business OS for Lekkerpreneurs",
    url: LEKKER_NETWORK_URL,
    icon: "grid-outline" as const,
    color: "#F5B800",
  },
  {
    id: "paylekker",
    title: "PayLekker",
    subtitle: "Payments for your business",
    url: LEKKER_PAYLEKKER_URL,
    icon: "card-outline" as const,
    color: "#22C55E",
  },
  {
    id: "university",
    title: "Lekker University",
    subtitle: "Learn digital & business skills",
    url: LEKKER_UNIVERSITY_URL,
    icon: "school-outline" as const,
    color: "#3B82F6",
  },
  {
    id: "website",
    title: "Lekker Website",
    subtitle: "R799 sites & free *.lekker.website",
    url: LEKKER_WEBSITE_URL,
    icon: "globe-outline" as const,
    color: "#A855F7",
  },
  {
    id: "events",
    title: "Events",
    subtitle: "Tickets & experiences",
    url: NATIVE_EVENTS_ROUTE,
    icon: "ticket-outline" as const,
    color: "#7C3AED",
  },
  {
    id: "social",
    title: "Lekker Social",
    subtitle: "Discover & connect nearby",
    url: LEKKER_SOCIAL_URL,
    icon: "heart-outline" as const,
    color: "#FF6B6B",
  },
] as const;
