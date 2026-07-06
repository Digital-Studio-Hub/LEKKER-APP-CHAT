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
  fromAddress?: string;
  bodyText: string;
  createdAt: string;
  isOutbound: boolean;
};

export type MailThreadDetail = {
  subject: string;
  messages: MailMessage[];
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

export async function fetchMailThread(threadId: string): Promise<MailThreadDetail> {
  const res = await apiRequest("GET", `/api/lekker/email/threads/${threadId}`);
  const data = await res.json();
  return {
    subject: data.subject || "",
    messages: data.messages || [],
  };
}

export async function sendMail(input: {
  to: string;
  subject: string;
  bodyText: string;
  inReplyTo?: string;
  references?: string;
}): Promise<{ success: boolean; message?: string; threadId?: string }> {
  try {
    const res = await apiRequest("POST", "/api/lekker/email/send", input);
    return await res.json();
  } catch (e: any) {
    return { success: false, message: e?.message || "Send failed" };
  }
}