/** Ecosystem URLs for Browse tab shortcuts */
export const LEKKER_MARKETPLACE_SHOP_URL = "https://lekkermarketplace.com/shop";
export const LEKKER_MARKETPLACE_EVENTS_URL = "https://lekkermarketplace.com/events";
export const LEKKER_SOCIAL_URL = "https://lekker.social";
export const LEKKER_NETWORK_URL = "https://lekker.network";
export const LEKKER_CHAT_WEB_URL = "https://chat.lekker.network";
export const LEKKER_CHAT_PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.lekker.chat";
export const GOOGLE_SEARCH_URL = "https://www.google.com/search?q=";

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
    id: "events",
    title: "Events",
    subtitle: "Tickets & experiences",
    url: LEKKER_MARKETPLACE_EVENTS_URL,
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