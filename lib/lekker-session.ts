import { apiRequest } from "@/lib/query-client";
import { LEKKER_NETWORK_URL } from "@/constants/ecosystem";

export async function fetchLekkerSoftwareUrl(): Promise<string> {
  try {
    const res = await apiRequest("GET", "/api/lekker/session-token");
    const data = await res.json();
    return data.url || LEKKER_NETWORK_URL;
  } catch {
    return LEKKER_NETWORK_URL;
  }
}