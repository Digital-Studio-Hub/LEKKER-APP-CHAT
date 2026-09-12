# Lekker Chat — Full Ecosystem Synergy Audit

**Date:** 2026-09-12  
**Chat HEAD:** `206246e` · **API:** `chat.lekker.network` (`lekker-chat` Cloud Run)  
**Companion plans:** [ECOSYSTEM-CONVERGENCE.md](./ECOSYSTEM-CONVERGENCE.md) · `user knowledge/infra/LEKKER-CHAT.md`

This audit answers: *where can Lekker Chat improve, and how do we make it more synergistic with lekker.network, Lekker Marketplace, and the rest of the fleet?*

---

## 1. North-star role (synergy lens)

| Product | Role in ecosystem | Chat’s relationship |
|---------|-------------------|---------------------|
| **lekker.network** (LekkerNetworkV3) | Business OS + Connect SoT + Cledwyn + Leads + Mail + Meet | Chat should be a **thin mobile client** over Network mobile APIs — not a second OS |
| **Lekker Marketplace** | Consumer discovery + Instant Match + shop + Events tickets | Chat Directory/enquire should feel like the **mobile front door** to the same leads/portal; Browse/Events should share Connect checkout attribution (`retailChannel=chat`) |
| **Storefront fleet** | Connect skins | Chat Connect proxies exist but UI does not consume them like Marketplace |
| **Lekker Social** | Dating (separate) | Browse shortcut only — keep brand-adjacent, not data-merged |
| **Lekker Chat** | Messaging layer (customers ↔ lekkerpreneurs + peer DMs) | Own Neon for threads/push is fine; **identity, leads, AI, mail, commerce** must stay Network/Marketplace-aligned |

**12‑month “full synergy” vision:** One WhatsApp-verified person; if they are a workspace owner/admin, Chat unlocks Software/Mail/workspace Cledwyn without a second login story. Customers find businesses in Directory, enquire anonymously, get replies in Chat *and* the Marketplace/Network portal from the same lead. Events and shop deep-links use Connect with `retailChannel=chat`. No Replit-only deps, no fake directory, no parallel Cledwyn brain.

---

## 2. Synergy map (what already works)

```
                    ┌─────────────────────────────┐
                    │     lekker.network (SoT)    │
                    │  users · workspaces · leads │
                    │  Cledwyn · Mail · Connect   │
                    └───────────┬─────────────────┘
            /api/v1/*           │           Connect /api/connect/*
         (X-API-Key)            │
    ┌───────────────┬───────────┴────────────┐
    ▼               ▼                        ▼
┌─────────┐   ┌───────────┐          ┌──────────────┐
│ Chat    │   │Marketplace│          │ Storefronts  │
│ Cloud   │   │ BFF       │          │ (NYCEE, …)   │
│ Run     │   │           │          │              │
└────┬────┘   └─────┬─────┘          └──────────────┘
     │              │
     │  Directory enquire ──► marketplace_leads ◄── Instant Match
     │  Portal replies ◄──── same lead transcript ──► Chat enquiry UI
     │
     └─ DMs/groups/push live in Neon Lekker_Chat (messaging island)
```

| Integration | Status | Evidence |
|-------------|--------|----------|
| WhatsApp OTP auth | ✅ Synergistic | Twilio; password carcass gated `410` |
| Directory list | ✅ | `GET /api/directory` → Network `/api/v1/lekkerpreneurs` (`directory_listed`) |
| Anonymous enquire → portal | ✅ (needs Network publish for name mask) | Chat → `/api/v1/chat/enquiries`; privacy defaults |
| Workspace Cledwyn proxy | ✅ wired | Chat → `/api/v1/cledwyn/chat` when synced |
| Generalist Cledwyn | ✅ Cloud Run | `XAI_API_KEY` (ecosystem xAI) |
| Mail tab | ✅ | Network `/api/v1/mobile/email/*` |
| Software SSO | ⚠️ interim | WebView via `/api/v1/mobile/session-token` |
| Phonebook match + WA invite | ✅ | `/api/contacts/match` + deep-link invites |
| Events Browse shortcut | ✅ thin | Marketplace `/events` webview |
| Connect bookings proxy | ⚠️ server only | `lib/connect-bookings.ts` unused by `app/` |
| Lekker Mail / GCS infra | ✅ | Replit Gmail/sidecar removed |

---

## 3. Improvement register (by synergy theme)

Priority: **P0** = broken or trust-breaking · **P1** = major synergy unlock · **P2** = polish / scale · **P3** = nice-to-have  
Effort: **S** &lt;1w · **M** 1–3w · **L** multi-sprint

### A. Identity — Chat JWT vs Network SoT

| Item | Current | Synergy opportunity | P | E |
|------|---------|---------------------|---|---|
| Dual user tables | Chat `users` + Network `users`; linked by `lekkerNetworkId` via `sync-lekker` | Treat Network user id as canonical; Chat row = device/messaging profile keyed by Network id | P1 | L |
| Sync fragility | Phone/email match; client once stripped verify fields (fixed `applyServerUser`) | Auto-sync on every login + Settings; surface 503 when API key missing (done) | P1 | S |
| Software SSO | Separate cookie mint for WebView | Longer-lived mobile Network session / shared JWT claim so Mail+Cledwyn+Software share one auth story | P1 | M |
| Placeholder emails | `p*@phone.lekker.chat` for WA-only users | Keep for Chat uniqueness; never sync placeholders to Network CRM | P2 | S |

**Synergy win:** Customer signs in once on Chat; lekkerpreneur status, workspace, Mail, and Cledwyn all resolve from Network without “sync” feeling like a bolt-on.

### B. Lekkerpreneur ↔ customer messaging (Network + Marketplace)

| Item | Current | Synergy opportunity | P | E |
|------|---------|---------------------|---|---|
| Directory enquire | Anonymous default; first-name mask on Network | Ensure Marketplace Leads UI uses `presentLeadForProvider` everywhere (no raw PII leaks) | P0 | S |
| Portal reply loop | Same `marketplace_leads` transcript | Push notify seeker in Chat when provider replies; deep-link to `/enquiry/[id]` | P1 | M |
| Upgrade to DM | Manual “Message” if both on Chat | After reveal contact, one-tap “Continue in Lekker Chat DM” for both sides | P1 | M |
| Instant Match vs Directory | Different opt-ins (`marketplace_leads_enabled` vs `directory_listed`) | Keep separate (correct); educate in Network Settings copy; optionally show “also on Instant Match” badge | P2 | S |
| Enquiry inbox UX | Thread exists; discoverability weak | Tab or Chats section: “Enquiries” with unread from portal | P1 | M |

**Synergy win:** Marketplace web portal and Chat mobile are two skins on **one lead conversation**, not two products.

### C. Cledwyn (Network AI)

| Item | Current | Synergy opportunity | P | E |
|------|---------|---------------------|---|---|
| Workspace mode | Proxies mobile advisor API (non-streaming, tool-light) | Grow Network mobile endpoint toward web tool runner / streaming parity | P1 | L |
| Generalist mode | xAI on Chat Cloud Run | Optional: single Network “consumer Cledwyn” endpoint so keys/models stay SoT | P2 | M |
| History | Chat AsyncStorage + Network thread when workspace | Unify history display (“Synced with lekker.network”) | P2 | M |
| Fallback | Falls back to generalist on 403 | Better copy + Settings deep-link “Sync Lekkerpreneur” | P1 | S |

**Synergy win:** Same Cledwyn brain and memory whether user is in Software WebView or Assistant tab.

### D. Commerce — Marketplace Events / Shop / Connect

| Item | Current | Synergy opportunity | P | E |
|------|---------|---------------------|---|---|
| Events | Browse → Marketplace webview | Native ticket flow via existing Chat Connect `bookings/checkout` + `retailChannel=chat` | P1 | M |
| Shop | Webview shop | Optional Connect cart for single-workspace sellers; keep Marketplace for multi-seller | P2 | L |
| Connect client | `lib/connect-api.ts` / `connect-bookings.ts` **unused by app UI** | Wire Browse “Tickets” / “Book” to native screens | P1 | M |
| Attribution | Marketplace sets `retailChannel=marketplace` | Chat must always set `chat` (server already defaults) — verify in payouts | P1 | S |
| PayLekker | None in Chat UI | Never invent Chat payments; only Connect checkout | P0 (policy) | — |

**Synergy win:** Ticket bought in Chat shows up in Network bookings + Marketplace confirmation patterns with correct channel analytics.

### E. Mail & Software

| Item | Current | Synergy opportunity | P | E |
|------|---------|---------------------|---|---|
| Mail | Native list/compose via Network | Push for new Lekker Mail; attachment parity | P2 | M |
| Software | Full OS in WebView | Progressive native: Leads inbox, today’s bookings, door mode shortcut | P2 | L |
| Activation gating | Mail only if `workspaceEmailActive` | Clear empty-state CTA → Network Lekker Mail setup | P2 | S |

### F. Peer messaging (Chat island — keep, but connect)

| Item | Current | Synergy opportunity | P | E |
|------|---------|---------------------|---|---|
| DMs / groups / push | Neon Lekker_Chat | Keep local for latency; key participants by `lekkerNetworkId` when known | P2 | M |
| Phonebook invites | WA deep-link multi-select | Track invite → install → auto-match (growth loop) | P2 | M |
| Feed | Server feed | Optional cross-post from Network social publish — low priority vs messaging | P3 | L |

### G. Platform hygiene (enables synergy)

| Item | Current | Synergy opportunity | P | E |
|------|---------|---------------------|---|---|
| iOS bundle id | **Done (app.json):** `com.lekker.chat` (matches Android). See `docs/IOS-BUNDLE-ID.md` — ASC migration may still be needed if live store app used `app.replit.lekkerchatios` | Confirm ASC / next prebuild | P1 | M |
| EAS projectId | Real UUID in `app.json` (`385aa478-…`) | HANDOVER “placeholder projectId” note is **stale** — refresh docs | P2 | S |
| Duplicate roots | **Partial:** root `routes.ts` → `server/_dead/routes.root.ts`; remaining Expo root dupes listed in `docs/DEAD-CODE.md` (still gitignored, not moved) | Move remaining root dupes after Metro safety check | P1 | S |
| Docs | HANDOVER / AGENTS / GOOGLE_PLAY still cite Replit API | Cloud Run–only truth (`eas.json` already correct) | P2 | S |
| Dev default URL | **Done:** `LEKKER_API_BASE` / `LEKKER_MOBILE_BASE` default `https://lekker.network` (`LEKKER_API_BASE_URL` override still works); Replit `.spock` fallback removed | Rebuild `server_dist` on next deploy | P1 | S |
| Store builds | Client features ahead of last Play build | EAS from `206246e+` / `0660e40+` | P0 | S |

---

## 4. Cross-product synergy matrix

| If we improve… | Network gains | Marketplace gains | Chat gains |
|----------------|---------------|-------------------|------------|
| Shared identity | Fewer sync bugs; mobile API usage | Same seeker across web/app | One profile |
| Lead push + DM upgrade | Higher response rates | Portal feels live | Sticky messaging |
| Native Events checkout | `retailChannel=chat` revenue | Less webview bounce | In-app conversion |
| Cledwyn tool parity | One AI investment | — | Trust / retention for MSMEs |
| Directory quality | `directory_listed` meaning clear | Instant Match stays distinct | No fake listings |

---

## 5. Recommended sequence (synergy-first)

### Now (ops — no big code) — **P0**
1. **Publish Network** `main` (Cledwyn admin access, first-name enquire mask).  
2. **EAS Android (+ iOS) build** from Chat `0660e40+`.  
3. **Production E2E:** Directory → anonymous enquire → Network/Marketplace Leads reply → Chat enquiry thread → reveal contact.  
4. Device QA: phonebook invite (on-app DM vs WA), Assistant modes (workspace vs generalist), profile photo/email.

### Next sprint (P0–P1 synergy)
1. ~~Fix Chat `LEKKER_API_BASE` hard-coded Replit fallback → always production Network.~~ **Done**  
2. Enquiry **push notifications** when provider replies.  
3. Wire **one** native Connect surface: Events ticket pay (`retailChannel=chat`).  
4. ~~Delete / quarantine duplicate root `routes.ts`~~ **Done** (`server/_dead/`); remaining Expo root dupes → `docs/DEAD-CODE.md` follow-up.  
5. ~~Plan **iOS bundle id** migration~~ — `app.json` set to `com.lekker.chat`; ASC follow-up if store still on Replit id (`docs/IOS-BUNDLE-ID.md`).

### Following (P1–P2)
1. Identity consolidation design (Chat DB = messaging only).  
2. Enrich Network mobile Cledwyn (stream + more tools).  
3. “Continue in DM” after contact reveal.  
4. Enquiries section in Chats tab.

### Later (P2–P3)
1. Progressive native Software modules.  
2. Invite attribution analytics.  
3. Consumer Cledwyn hosted only on Network.

---

## 6. Explicit non-goals (avoid false synergy)

- Do **not** merge Instant Match lead broadcast into Directory enquire (different consent).  
- Do **not** merge Lekker Social dating graph into Chat.  
- Do **not** build a Chat-local payment gateway.  
- Do **not** host a second events inventory (Network Booking OS remains SoT).  
- Do **not** treat Software WebView removal as urgent if Leads/Cledwyn/Mail work.

---

## 7. Scorecard (honest)

| Dimension | Score (1–5) | Comment |
|-----------|-------------|---------|
| Messaging core (DM/group/push) | 4 | Solid Chat island |
| Network identity link | 3 | Works; still dual-DB |
| Marketplace lead loop | 4 | Designed well; needs push + QA |
| Cledwyn synergy | 3.5 | Proxied; tool parity incomplete |
| Commerce synergy | 2 | Webviews; Connect unused in UI |
| Infra alignment | 4 | Cloud Run + Lekker Mail + GCS + xAI |
| Store / packaging | 3.5 | Android OK; iOS `app.json` now `com.lekker.chat` (ASC TBD) |
| **Overall synergy** | **~3.2** | Past “bolt-on”; not yet “one platform” |

---

## 8. Decision prompts for Delano

1. **Identity:** Keep dual DB long-term, or commit to Network-id-first migration this quarter?  
2. **Commerce:** Native Events in Chat next, or deepen enquire→DM / push-on-reply loop first?  
3. **Cledwyn:** Invest in Network mobile tool parity, or accept advisor-lite + Software for power users?  
4. **iOS bundle id:** `app.json` fixed to `com.lekker.chat` — schedule ASC migration now or after Android QA if live app used Replit id?

---

## 9. Explore-pass addenda (2026-09-12)

Additional evidence from a full codebase explore (aligned with this audit):

- Chat DMs are intentionally **not** Network CRM threads; enquire leads are the cross-product conversation SoT.  
- Connect checkout proxies + `lib/connect-bookings.ts` exist with `retailChannel=chat` defaults — **zero `app/` imports** (dead synergy).  
- Instant Match (`marketplace_leads_enabled`) vs Chat directory (`directory_listed`) must stay separate consent models.  
- PayLekker belongs only via Connect — never a Chat-local gateway.  
- 12‑month vision: Chat as phone-native front door; Network remains SoT for businesses, CRM, payments, and AI.

---

*Audit authored for Digital Studio Hub / Lekker Network. Update this file when P0–P1 items ship; keep ECOSYSTEM-CONVERGENCE.md as the execution backlog.*
