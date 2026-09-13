import { apiRequest } from "@/lib/query-client";

export type ScheduleItem = {
  id: string;
  title: string;
  startsAt: string | null;
  endsAt: string | null;
  status: string;
  href?: string | null;
  kind?: string;
  type?: string;
  mode?: string;
};

export type SchedulePayload = {
  success: boolean;
  available: boolean;
  from?: string;
  to?: string;
  meetings: ScheduleItem[];
  offerings: ScheduleItem[];
  bookings: ScheduleItem[];
  activeNow: ScheduleItem[];
};

function startOfDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export async function fetchSchedule(range: "today" | "week" = "week"): Promise<SchedulePayload> {
  const from = startOfDay();
  const to =
    range === "today"
      ? endOfDay()
      : new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);
  try {
    const qs = new URLSearchParams({
      from: from.toISOString(),
      to: to.toISOString(),
    });
    const res = await apiRequest("GET", `/api/schedule?${qs}`);
    const data = await res.json();
    return {
      success: !!data.success,
      available: data.available !== false,
      from: data.from,
      to: data.to,
      meetings: Array.isArray(data.meetings) ? data.meetings : [],
      offerings: Array.isArray(data.offerings) ? data.offerings : [],
      bookings: Array.isArray(data.bookings) ? data.bookings : [],
      activeNow: Array.isArray(data.activeNow) ? data.activeNow : [],
    };
  } catch {
    return {
      success: false,
      available: false,
      meetings: [],
      offerings: [],
      bookings: [],
      activeNow: [],
    };
  }
}

export function flattenScheduleItems(payload: SchedulePayload): ScheduleItem[] {
  const rows: ScheduleItem[] = [
    ...payload.meetings.map((m) => ({ ...m, kind: m.kind || "meet" })),
    ...payload.bookings.map((b) => ({ ...b, kind: b.kind || b.type || "booking" })),
    ...payload.offerings.map((o) => ({ ...o, kind: o.kind || o.type || "offering" })),
  ];
  rows.sort((a, b) => {
    const ta = a.startsAt ? new Date(a.startsAt).getTime() : Number.MAX_SAFE_INTEGER;
    const tb = b.startsAt ? new Date(b.startsAt).getTime() : Number.MAX_SAFE_INTEGER;
    return ta - tb;
  });
  return rows;
}

export function formatScheduleWhen(item: ScheduleItem): string {
  if (!item.startsAt) return item.status || "Scheduled";
  const start = new Date(item.startsAt);
  const end = item.endsAt ? new Date(item.endsAt) : null;
  const day = start.toLocaleDateString("en-ZA", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Africa/Johannesburg",
  });
  const t0 = start.toLocaleTimeString("en-ZA", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Johannesburg",
  });
  const t1 = end
    ? end.toLocaleTimeString("en-ZA", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Africa/Johannesburg",
      })
    : null;
  return t1 ? `${day} · ${t0}–${t1}` : `${day} · ${t0}`;
}
