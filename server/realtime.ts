/**
 * Chat realtime bus: Postgres LISTEN/NOTIFY + per-instance SSE fan-out.
 * Send path stays POST; foreground clients subscribe via GET /api/realtime/stream.
 *
 * Neon transaction pooler does not support LISTEN — use DATABASE_URL_DIRECT
 * (non-pooler) or a derived direct URL.
 */
import type { Response } from "express";
import { Client } from "pg";
import { eq } from "drizzle-orm";
import { db, pool } from "./storage";
import { chatParticipants } from "@shared/schema";
import type { ChatMessage } from "@shared/schema";

export const REALTIME_CHANNEL = "lekker_chat";

export type RealtimeEventType =
  | "message.created"
  | "message.updated"
  | "message.deleted"
  | "ready"
  | "ping";

export type RealtimeEvent = {
  type: RealtimeEventType;
  chatId?: string;
  messageId?: string;
  senderId?: string;
  createdAt?: string;
  preview?: string | null;
  message?: Partial<ChatMessage> | null;
  /** When set (e.g. companion inbox), only this user's SSE subscribers receive it. */
  targetUserId?: string;
};

type Subscriber = {
  userId: string;
  res: Response;
  /** If set, only events for this chat; otherwise all chats the user is in. */
  chatId: string | null;
  chatIds: Set<string>;
  heartbeat: ReturnType<typeof setInterval> | null;
};

const subscribers = new Map<string, Set<Subscriber>>();

let listenClient: Client | null = null;
let listenStarting: Promise<void> | null = null;
let reconnectAttempt = 0;
let stopped = false;

function deriveDirectDatabaseUrl(poolUrl: string): string {
  try {
    const u = new URL(poolUrl);
    if (u.hostname.includes("-pooler.")) {
      u.hostname = u.hostname.replace("-pooler.", ".");
    }
    return u.toString();
  } catch {
    return poolUrl.replace("-pooler.", ".");
  }
}

export function getRealtimeListenUrl(): string {
  const direct = process.env.DATABASE_URL_DIRECT?.trim();
  if (direct) return direct;
  const base = process.env.DATABASE_URL?.trim();
  if (!base) throw new Error("DATABASE_URL required for realtime LISTEN");
  return deriveDirectDatabaseUrl(base);
}

function sseWrite(res: Response, event: RealtimeEvent | { type: "ping" }, eventName?: string) {
  try {
    if (eventName) {
      res.write(`event: ${eventName}\n`);
    }
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  } catch {
    /* client gone */
  }
}

function truncatePreview(content: string | null | undefined, max = 120): string | null {
  if (!content) return null;
  const t = content.trim();
  if (!t) return null;
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

function serializeMessage(message: ChatMessage): Partial<ChatMessage> {
  return {
    id: message.id,
    chatId: message.chatId,
    senderId: message.senderId,
    content: message.content,
    type: message.type,
    status: message.status,
    imageUri: message.imageUri,
    fileUri: message.fileUri,
    fileName: message.fileName,
    fileSize: message.fileSize,
    audioUri: message.audioUri,
    audioDuration: message.audioDuration,
    waveformData: message.waveformData,
    latitude: message.latitude,
    longitude: message.longitude,
    locationName: message.locationName,
    pollQuestion: message.pollQuestion,
    pollOptions: message.pollOptions,
    sharedContactName: message.sharedContactName,
    sharedContactPhone: message.sharedContactPhone,
    replyToMessageId: message.replyToMessageId,
    editedAt: message.editedAt,
    isDeleted: message.isDeleted,
    createdAt: message.createdAt,
  };
}

export function messageToRealtimeEvent(
  type: "message.created" | "message.updated" | "message.deleted",
  message: ChatMessage,
): RealtimeEvent {
  return {
    type,
    chatId: message.chatId,
    messageId: message.id,
    senderId: message.senderId,
    createdAt:
      message.createdAt instanceof Date
        ? message.createdAt.toISOString()
        : String(message.createdAt || ""),
    preview: truncatePreview(message.content),
    message: serializeMessage(message),
  };
}

function slimEvent(event: RealtimeEvent): RealtimeEvent {
  return {
    type: event.type,
    chatId: event.chatId,
    messageId: event.messageId,
    senderId: event.senderId,
    createdAt: event.createdAt,
    preview: event.preview,
    message: event.message
      ? {
          id: event.message.id,
          chatId: event.message.chatId,
          senderId: event.message.senderId,
          content: event.message.content,
          type: event.message.type,
          status: event.message.status,
          isDeleted: event.message.isDeleted,
          createdAt: event.message.createdAt,
          imageUri: event.message.imageUri,
          fileUri: event.message.fileUri,
          fileName: event.message.fileName,
          audioUri: event.message.audioUri,
          audioDuration: event.message.audioDuration,
          replyToMessageId: event.message.replyToMessageId,
          editedAt: event.message.editedAt,
        }
      : null,
  };
}

/** Publish to all Cloud Run instances via Postgres NOTIFY (payload max ~8KB). */
export async function publishRealtimeEvent(event: RealtimeEvent): Promise<void> {
  if (!event.type.startsWith("message.")) return;
  let payload = JSON.stringify(event);
  if (payload.length > 7500) {
    payload = JSON.stringify(slimEvent(event));
  }
  if (payload.length > 7900) {
    payload = JSON.stringify({
      type: event.type,
      chatId: event.chatId,
      messageId: event.messageId,
      senderId: event.senderId,
      createdAt: event.createdAt,
      preview: event.preview,
    });
  }
  try {
    // Fan-out only via LISTEN (including this instance) to avoid duplicate delivery.
    await pool.query("SELECT pg_notify($1, $2)", [REALTIME_CHANNEL, payload]);
  } catch (e: any) {
    console.error("[Realtime] NOTIFY failed:", e?.message || e);
  }
}

function fanOutLocal(event: RealtimeEvent) {
  if (!event.chatId) return;
  const isCompanion = event.chatId === "__cledwyn_companion__";
  for (const [userId, set] of subscribers) {
    if (event.targetUserId && event.targetUserId !== userId) continue;
    for (const sub of set) {
      if (sub.chatId && sub.chatId !== event.chatId) continue;
      if (!sub.chatId && !isCompanion && !sub.chatIds.has(event.chatId)) continue;
      sseWrite(sub.res, event);
    }
  }
}

async function loadUserChatIds(userId: string): Promise<Set<string>> {
  const rows = await db
    .select({ chatId: chatParticipants.chatId })
    .from(chatParticipants)
    .where(eq(chatParticipants.userId, userId));
  return new Set(rows.map((r) => r.chatId));
}

export async function addRealtimeSubscriber(opts: {
  userId: string;
  res: Response;
  chatId?: string | null;
}): Promise<Subscriber> {
  const chatIds = await loadUserChatIds(opts.userId);
  if (opts.chatId) {
    if (!chatIds.has(opts.chatId)) {
      throw Object.assign(new Error("Not a participant of this chat"), { status: 403 });
    }
  }

  const sub: Subscriber = {
    userId: opts.userId,
    res: opts.res,
    chatId: opts.chatId || null,
    chatIds,
    heartbeat: null,
  };

  let set = subscribers.get(opts.userId);
  if (!set) {
    set = new Set();
    subscribers.set(opts.userId, set);
  }
  set.add(sub);

  sub.heartbeat = setInterval(() => {
    sseWrite(sub.res, { type: "ping" }, "ping");
  }, 15_000);

  return sub;
}

export function removeRealtimeSubscriber(sub: Subscriber) {
  if (sub.heartbeat) {
    clearInterval(sub.heartbeat);
    sub.heartbeat = null;
  }
  const set = subscribers.get(sub.userId);
  if (!set) return;
  set.delete(sub);
  if (set.size === 0) subscribers.delete(sub.userId);
}

export function realtimeSubscriberCount(): number {
  let n = 0;
  for (const set of subscribers.values()) n += set.size;
  return n;
}

async function handleNotifyPayload(raw: string) {
  try {
    const event = JSON.parse(raw) as RealtimeEvent;
    if (!event?.type || !event.chatId) return;
    fanOutLocal(event);
  } catch (e) {
    console.warn("[Realtime] bad NOTIFY payload", e);
  }
}

async function connectListener(): Promise<void> {
  if (stopped) return;
  const url = getRealtimeListenUrl();
  const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });
  client.on("error", (err) => {
    console.error("[Realtime] LISTEN client error:", err.message);
  });
  client.on("notification", (msg) => {
    if (msg.channel !== REALTIME_CHANNEL || !msg.payload) return;
    void handleNotifyPayload(msg.payload);
  });
  client.on("end", () => {
    listenClient = null;
    if (!stopped) scheduleReconnect();
  });

  await client.connect();
  await client.query(`LISTEN ${REALTIME_CHANNEL}`);
  listenClient = client;
  reconnectAttempt = 0;
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return "?";
    }
  })();
  console.log(`[Realtime] LISTEN ${REALTIME_CHANNEL} ok host=${host}`);
}

function scheduleReconnect() {
  if (stopped) return;
  const delay = Math.min(30_000, 1000 * 2 ** Math.min(reconnectAttempt, 5));
  reconnectAttempt += 1;
  console.warn(`[Realtime] reconnecting LISTEN in ${delay}ms (attempt ${reconnectAttempt})`);
  setTimeout(() => {
    void startRealtimeListener();
  }, delay);
}

/** Start (or no-op if already started) the process-wide LISTEN client. */
export function startRealtimeListener(): Promise<void> {
  if (listenClient) return Promise.resolve();
  if (listenStarting) return listenStarting;
  listenStarting = connectListener()
    .catch((e) => {
      console.error("[Realtime] LISTEN start failed:", e?.message || e);
      listenStarting = null;
      scheduleReconnect();
    })
    .then(() => {
      listenStarting = null;
    });
  return listenStarting;
}

export function stopRealtimeListener() {
  stopped = true;
  if (listenClient) {
    void listenClient.end().catch(() => undefined);
    listenClient = null;
  }
}

/** Express handler bits for SSE response setup. */
export function initSseResponse(res: Response) {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  // @ts-expect-error — Node flushHeaders exists on ServerResponse
  if (typeof res.flushHeaders === "function") res.flushHeaders();
}
