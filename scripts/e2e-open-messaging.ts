import { storage } from "../server/storage";
import { hashPassword, generateToken } from "../server/auth";

const base = "http://127.0.0.1:5000";

async function ensureUser(phone: string, username: string, first: string, last: string) {
  let user = await storage.getUserByPhone(phone);
  if (!user) {
    const passwordHash = await hashPassword("TestPass1!");
    user = await storage.createUser({
      phone,
      email: `${username}@lekker.chat.test`,
      username,
      firstName: first,
      lastName: last,
      passwordHash,
      avatarColor: "#F5B800",
      role: "user",
      emailVerified: true,
      phoneVerified: true,
      lekkerNetworkAccess: false,
      autoReplyEnabled: false,
      notificationsEnabled: true,
      locationEnabled: false,
      presence: "online",
    } as any);
  } else {
    await storage.updateUser(user.id, { phoneVerified: true, emailVerified: true });
    user = (await storage.getUser(user.id))!;
  }
  const token = generateToken({ userId: user.id, email: user.email, role: user.role });
  return { user, token };
}

async function api(method: string, path: string, token: string, body?: any) {
  const res = await fetch(base + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  return { status: res.status, data };
}

async function main() {
  const alice = await ensureUser("+27821110001", "alice_e2e", "Alice", "Test");
  const bob = await ensureUser("+27821110002", "bob_e2e", "Bob", "Test");
  console.log("users", { alice: alice.user.id, bob: bob.user.id });

  const match = await api("POST", "/api/contacts/match", alice.token, {
    phones: ["082 111 0002", "+27821110002", "27821110099"],
  });
  console.log("match status", match.status, "matches", match.data.matches);
  const foundBob = (match.data.matches || []).some((m: any) => m.userId === bob.user.id);
  console.log("FOUND_BOB", foundBob);

  const start = await api("POST", "/api/chats/start-with-contact", alice.token, {
    phone: "0821110002",
  });
  console.log("start status", start.status, "chatId", start.data.chat?.id, "err", start.data.message);
  const chatId = start.data.chat?.id;
  if (!chatId) {
    console.error("FAIL no chat");
    process.exit(1);
  }

  const send = await api("POST", `/api/chats/${chatId}/messages`, alice.token, {
    content: "Hey Bob — WhatsApp-style open messaging works!",
    type: "text",
  });
  console.log("send status", send.status, "msgId", send.data.message?.id);

  const bobChats = await api("GET", "/api/chats", bob.token);
  const bobHas = (bobChats.data.chats || []).some((c: any) => c.id === chatId);
  console.log("bob inbox has chat", bobHas, "chatCount", (bobChats.data.chats || []).length);

  const msgs = await api("GET", `/api/chats/${chatId}/messages`, bob.token);
  const contents = (msgs.data.messages || []).map((m: any) => m.content);
  console.log("bob messages", contents);

  const reply = await api("POST", `/api/chats/${chatId}/messages`, bob.token, {
    content: "Got it Alice!",
    type: "text",
  });
  console.log("reply status", reply.status);

  const ok =
    foundBob &&
    !!chatId &&
    send.status === 201 &&
    bobHas &&
    contents.some((c: string) => String(c || "").includes("WhatsApp-style")) &&
    reply.status === 201;
  console.log(ok ? "E2E_PASS" : "E2E_FAIL");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
