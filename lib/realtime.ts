/**
 * Foreground chat realtime (SSE) — complements Expo push for background.
 */
import { AppState, type AppStateStatus } from "react-native";
import { getApiUrl } from "@/lib/query-client";
import { getAuthToken } from "@/lib/auth-token";
import type { ServerMessage } from "@/lib/chat-api";

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
  message?: ServerMessage | null;
  subscribers?: number;
};

type Listener = (event: RealtimeEvent) => void;

let listeners = new Set<Listener>();
let abort: AbortController | null = null;
let loopPromise: Promise<void> | null = null;
let wanted = false;
let appStateSub: { remove: () => void } | null = null;
let connected = false;

export function isRealtimeConnected(): boolean {
  return connected;
}

export function subscribeRealtime(listener: Listener): () => void {
  listeners.add(listener);
  ensureRealtimeStarted();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      // Keep connection briefly if empty — stop when app backgrounds instead.
    }
  };
}

function emit(event: RealtimeEvent) {
  for (const l of listeners) {
    try {
      l(event);
    } catch (e) {
      console.warn("[Realtime] listener error", e);
    }
  }
}

function shouldRun(): boolean {
  return wanted && AppState.currentState === "active" && listeners.size > 0;
}

async function streamLoop() {
  let backoffMs = 1000;
  while (shouldRun()) {
    const token = getAuthToken();
    if (!token) {
      connected = false;
      await sleep(2000);
      continue;
    }

    abort = new AbortController();
    try {
      const url = new URL("/api/realtime/stream", getApiUrl()).toString();
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "text/event-stream",
          Authorization: `Bearer ${token}`,
          "Cache-Control": "no-cache",
        },
        signal: abort.signal,
        // @ts-expect-error RN fetch cache option
        cache: "no-store",
      });

      if (!res.ok) {
        connected = false;
        console.warn("[Realtime] stream HTTP", res.status);
        await sleep(backoffMs);
        backoffMs = Math.min(30_000, backoffMs * 2);
        continue;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        connected = false;
        await sleep(backoffMs);
        backoffMs = Math.min(30_000, backoffMs * 2);
        continue;
      }

      connected = true;
      backoffMs = 1000;
      const decoder = new TextDecoder();
      let buffer = "";

      while (shouldRun()) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n");
        buffer = parts.pop() || "";

        let eventName = "message";
        for (const line of parts) {
          if (line.startsWith("event:")) {
            eventName = line.slice(6).trim();
            continue;
          }
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (!data) continue;
          try {
            const parsed = JSON.parse(data) as RealtimeEvent;
            if (eventName === "ping" || parsed.type === "ping") continue;
            emit(parsed);
          } catch {
            /* ignore malformed chunk */
          }
        }
      }
      connected = false;
      try {
        reader.releaseLock();
      } catch {
        /* ignore */
      }
    } catch (e: any) {
      connected = false;
      if (e?.name !== "AbortError") {
        console.warn("[Realtime] stream error:", e?.message || e);
      }
    }

    if (!shouldRun()) break;
    await sleep(backoffMs);
    backoffMs = Math.min(30_000, backoffMs * 2);
  }
  connected = false;
  loopPromise = null;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function onAppState(next: AppStateStatus) {
  if (next === "active") {
    if (wanted && listeners.size > 0) ensureRealtimeStarted();
  } else {
    // Background: drop SSE; Expo push covers closed-app delivery.
    abort?.abort();
    connected = false;
  }
}

export function ensureRealtimeStarted() {
  wanted = true;
  if (!appStateSub) {
    appStateSub = AppState.addEventListener("change", onAppState);
  }
  if (!shouldRun()) return;
  if (loopPromise) return;
  loopPromise = streamLoop();
}

export function stopRealtime() {
  wanted = false;
  abort?.abort();
  abort = null;
  connected = false;
}

/** Map realtime payload message into ServerMessage shape when present. */
export function realtimeMessageToServer(event: RealtimeEvent): ServerMessage | null {
  const m = event.message;
  if (!m || !m.id || !m.chatId || !m.senderId) return null;
  return {
    id: m.id,
    chatId: m.chatId,
    senderId: m.senderId,
    content: m.content ?? null,
    type: m.type || "text",
    status: m.status || "sent",
    imageUri: m.imageUri ?? null,
    fileUri: m.fileUri ?? null,
    fileName: m.fileName ?? null,
    fileSize: m.fileSize ?? null,
    audioUri: m.audioUri ?? null,
    audioDuration: m.audioDuration ?? null,
    waveformData: m.waveformData ?? null,
    latitude: m.latitude ?? null,
    longitude: m.longitude ?? null,
    locationName: m.locationName ?? null,
    pollQuestion: m.pollQuestion ?? null,
    pollOptions: m.pollOptions ?? null,
    sharedContactName: m.sharedContactName ?? null,
    sharedContactPhone: m.sharedContactPhone ?? null,
    replyToMessageId: m.replyToMessageId ?? null,
    editedAt: m.editedAt ?? null,
    isDeleted: !!m.isDeleted,
    createdAt: m.createdAt || event.createdAt || new Date().toISOString(),
  } as ServerMessage;
}
