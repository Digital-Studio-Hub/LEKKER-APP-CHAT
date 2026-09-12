# Identity consolidation — Chat ↔ Network

**Status:** Design (P2) · **Date:** 2026-09-12  
**Repos:** LEKKER-APP-CHAT · LekkerNetworkV3

---

## Current state

| Store | Role today |
|-------|------------|
| **Network `users`** | Business OS identity (WhatsApp OTP, workspaces, Mail, Cledwyn, leads) |
| **Chat Neon `users`** | Messaging JWT subject; also copies business profile fields |

Link today: Chat row stores `lekkerNetworkId` after `POST /api/auth/sync-lekker` (phone/email match against Network). Chat JWT still signs Chat’s own `users.id`. Directory, Mail, Software SSO, and workspace Cledwyn already require a successful sync.

Pain: dual writes, sync feels bolted-on, profile fields can drift, lookups mix Chat id and Network id.

---

## Target state

**Network user id = source of truth (SoT).**

Chat DB remains a **messaging island** keyed by Network id:

| Chat owns | Network owns |
|-----------|--------------|
| Threads, participants, push tokens | Auth, phone, workspace membership |
| Feed posts / reactions (Chat surface) | Business profile, directory, leads |
| Safety blocks / reports (Chat peers) | Cledwyn memory, Mail, Connect |

Conceptual Chat user row:

- `networkUserId` (unique, required once linked) — today’s `lekkerNetworkId`
- Device/messaging fields only (avatar color, presence, push prefs, Chat-local display overrides)
- **Not** SoT for `businessName`, verification badges, workspace ids — fetch or cache-from-Network with clear “cached” semantics

Chat JWT may still use an internal Chat row id short-term, but every cross-product call uses `networkUserId`.

---

## Phases

### A — Always store `lekkerNetworkId` on sync/login

- Auto-run sync after WhatsApp verify / login (already partially done).
- Never clear Network link fields on profile patch (`applyServerUser` / Settings).
- Surface 503 when Network API key missing instead of silent “not a lekkerpreneur”.
- Backfill: batch match Chat users with phone/email and null `lekkerNetworkId`.

### B — Stop duplicating business profile as SoT

- Treat Network directory / workspace payloads as canonical for lekkerpreneur UI.
- Chat `users` business columns become optional cache or display-only; stop writing them from client as authority.
- Placeholder emails (`p*@phone.lekker.chat`) stay Chat-local for uniqueness — **never** push to Network CRM.

### C — Migrate lookups

- Prefer `getUserByLekkerNetworkId` / `networkUserId` for start-DM, directory “Message”, enquire seeker correlation, push targeting when both known.
- Participants table: store `networkUserId` alongside Chat `userId` (nullable → backfill → require for new rows).
- Feed / safety: filter and report by Network id when available; keep Chat id for unlinked peers.

### D — Optional SSO JWT claim (later)

- Mint Chat JWT (or Network mobile session) with `networkUserId` claim so Mail + Cledwyn + Software share one auth story.
- Longer-lived Network mobile session for WebView without a second cookie dance.
- Out of scope until A–C are stable.

---

## Risks

| Risk | Mitigation |
|------|------------|
| **Orphan chats** — peer never synced / Network id missing | Keep Chat `userId` as participant PK; Network id additive; degrade to Chat-only DM |
| **Apple Review accounts** | Dedicated bypass phones; do not require Network link for review login |
| **Placeholder emails** | Detect `*@phone.lekker.chat`; exclude from Network match/sync outbound |
| **Broken sync mid-migration** | Feature-flag Network-id-first paths; dual-read until backfill complete |
| **Duplicate Chat rows** for one Network user | Unique index on `lekker_network_id` after cleanup |

---

## Non-goals

- **Do not** merge Lekker Social (dating) identity or graph into Chat.
- **Do not** move DM/group message bodies into Network Postgres in this program.
- **Do not** invent a third identity provider; Network WhatsApp OTP remains the person key.

---

## Success criteria

1. Every verified lekkerpreneur Chat session has a durable `lekkerNetworkId`.
2. Directory / Mail / workspace Cledwyn never depend on Chat-copied business fields as SoT.
3. New DMs can resolve a peer by Network id when both are linked.
4. Social dating accounts remain fully separate.

---

*Companion: [ECOSYSTEM-SYNERGY-AUDIT.md](./ECOSYSTEM-SYNERGY-AUDIT.md) §A · [ECOSYSTEM-CONVERGENCE.md](./ECOSYSTEM-CONVERGENCE.md) gap #4.*
