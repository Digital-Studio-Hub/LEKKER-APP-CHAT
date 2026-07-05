import { apiRequest } from "@/lib/query-client";

export type MailThread = {
  id: string;
  subject: string;
  snippet: string;
  fromName: string;
  unread: boolean;
  updatedAt: string;
};

export type MailMessage = {
  id: string;
  from: string;
  bodyText: string;
  createdAt: string;
  isOutbound: boolean;
};

export async function fetchMailStatus(): Promise<{ active: boolean; unreadCount?: number }> {
  try {
    const res = await apiRequest("GET", "/api/lekker/email/status");
    return await res.json();
  } catch {
    return { active: false };
  }
}

export async function fetchMailThreads(page = 1): Promise<MailThread[]> {
  try {
    const res = await apiRequest("GET", `/api/lekker/email/threads?page=${page}`);
    const data = await res.json();
    return data.threads || [];
  } catch {
    return [];
  }
}

export async function fetchMailThread(threadId: string): Promise<MailMessage[]> {
  try {
    const res = await apiRequest("GET", `/api/lekker/email/threads/${threadId}`);
    const data = await res.json();
    return data.messages || [];
  } catch {
    return [];
  }
}