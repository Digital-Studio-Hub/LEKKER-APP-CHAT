/**
 * Open a shared chat location without a Google Maps URL.
 * Android uses a geo: URI (system chooser). iOS uses the Apple Maps scheme.
 * Web and any other platform use OpenStreetMap.
 */

export type LocationOpenTarget = {
  kind: "uri" | "web";
  url: string;
};

function parseCoord(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function locationOpenTarget(
  platform: string,
  latitude: unknown,
  longitude: unknown,
): LocationOpenTarget | null {
  const lat = parseCoord(latitude);
  const lng = parseCoord(longitude);
  if (lat === null || lng === null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  const latStr = String(lat);
  const lngStr = String(lng);

  if (platform === "android") {
    return {
      kind: "uri",
      url: `geo:${latStr},${lngStr}?q=${latStr},${lngStr}`,
    };
  }

  if (platform === "ios") {
    return {
      kind: "uri",
      url: `maps:0,0?q=${latStr},${lngStr}`,
    };
  }

  const qLat = encodeURIComponent(latStr);
  const qLng = encodeURIComponent(lngStr);
  return {
    kind: "web",
    url: `https://www.openstreetmap.org/?mlat=${qLat}&mlon=${qLng}#map=16/${qLat}/${qLng}`,
  };
}
