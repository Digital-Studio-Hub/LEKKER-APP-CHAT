# Lekker Chat — Ecosystem Convergence Plan

Last updated: 2026-09-12  
Repo: `Digital-Studio-Hub/LEKKER-APP-CHAT`  
Companion: `user knowledge/infra/LEKKER-CHAT.md`

---

## Product role (why Chat exists)

Lekker Chat is the **mobile messaging layer** for the Lekker ecosystem — not a second business OS and not Lekker Social dating.

| Actor | Job to be done |
|-------|----------------|
| **Customer / seeker** | Find a lekkerpreneur in Directory → enquire or message → get replies (in Chat and/or Marketplace customer portal) |
| **Lekkerpreneur** | Receive enquiries in Network Leads / Marketplace Chat portal → reply without forcing the seeker onto WhatsApp |
| **Verified workspace owner** | Software tab SSO into lekker.network; Mail tab for Lekker Mail; Assistant should become **workspace Cledwyn** |

**Critical product loop:** Directory → enquiry → provider reply on Marketplace/Network portal → seeker continues in Chat. Contact details stay private until the seeker opts in.

---

## Current architecture (honest)

```
Android / iOS (Expo)
    │
    ▼
chat.lekker.network  (Cloud Run Express + Neon Lekker_Chat)
    ├── Own users / chats / feed / JWT
    ├── WhatsApp OTP (Twilio)          ✅ ecosystem-aligned
    ├── Transactional email            ✅ Lekker Mail / Zeptomail (was Replit Gmail)
    ├── Object storage                 ✅ GCS ADC (was Replit sidecar)
    ├── Directory + enquiries          → Network /api/v1/*          ✅
    ├── Mail tab                       → Network mobile email       ✅
    ├── Software tab                   → Network SSO WebView        ⚠️ interim
    ├── Assistant (Cledwyn)            → Network workspace proxy + xAI generalist ✅
    └── Connect proxies                → unused by app UI           ⚠️
```

Chat was built as a **standalone Replit messaging app**, then bolted onto Network. Marketplace is a **Connect skin**; Chat is still a **parallel stack** with Network adapters.

**Full audit (synergy with Network + Marketplace):** [ECOSYSTEM-SYNERGY-AUDIT.md](./ECOSYSTEM-SYNERGY-AUDIT.md)

---

## Gap register

| # | Area | Ecosystem standard | Chat today | Severity | Status |
|---|------|--------------------|------------|----------|--------|
| 1 | Transactional email | Lekker Mail / Zeptomail | Replit Gmail connector | Critical | **Done** (`15fc50c`) |
| 2 | Object storage | GCS ADC on Cloud Run | Replit `127.0.0.1:1106` sidecar | Critical | **Done** (`15fc50c`) |
| 3 | Cledwyn | Network workspace agent (`XAI`, tools) | Verified → Network `/api/v1/cledwyn/chat`; others → xAI generalist | Critical | **Done** (needs Network publish) |
| 4 | Identity SoT | Network users / workspaces | Own `users` + sync-lekker | High | Open |
| 5 | Directory → enquiry UX | Privacy-first Instant Match | Anonymous enquire default | High | **Done** |
| 5b | Phonebook → chat / invite | Match registered phones; WA deep-link invite | On-app DM + multi-select / invite-all WA | High | **Done** |
| 6 | Connect native UX | Marketplace Connect consumer | Server proxies; Browse = WebView | High | Open |
| 7 | Directory stub fallback | Network-only listing | Prod/Cloud Run returns empty + error (no fake businesses); `DIRECTORY_DATA` local/dev only | Med | **Done** (prod guard) |
| 8 | Password auth carcass | WhatsApp-only | `CHAT_WHATSAPP_ONLY` default ON (≠ `"false"`) → password register/login/reset return `410`; Apple Review WA bypass untouched | Med | **Done** (default ON) |
| 9 | Bundle / package IDs | `com.lekker.chat` | iOS still `app.replit.*` | Med | Open |
| 10 | Docs / deploy pins | Single Cloud Run truth | HANDOVER still cites Replit in places | Low | Partial |

---

## Customer ↔ lekkerpreneur messaging model

### Happy path (target)

1. Seeker opens **Directory** in Chat, selects a business.
2. Chooses **Enquire** (default: **anonymous contact** — phone/email hidden; **first name only** shown to provider).
3. Network creates a Marketplace lead (`source: lekker-chat-app`) assigned to that workspace.
4. Lekkerpreneur replies in **Marketplace / Network Leads portal**.
5. Seeker sees replies in Chat **enquiry thread**; can later **reveal phone/email**.
6. Optional: if both are on Chat, upgrade to a native DM.

### Privacy rules (KD)

| Field | Default on enquire | After seeker reveals |
|-------|--------------------|----------------------|
| Phone | Hidden from provider | Visible if `sharePhone` |
| Email | Hidden from provider | Visible if `shareEmail` |
| Display name | **First name only** while contact hidden | Full name when contact shared |
| Brief | Shared (needed to respond) | — |

Contact is always stored server-side so the seeker can keep chatting; it is **not** shown to the provider until opt-in. Same privacy model as Instant Match leads (`presentLeadForProvider`).

### Not in scope here

- Fully nameless “Anonymous customer” (rejected in favour of first-name-only)
- Merging Chat DMs into Network CRM threads without an enquiry lead
- Instant Match multi-provider broadcast from Directory (Directory is **direct** to one workspace)

---

## Convergence roadmap (ordered)

### Phase A — Platform foundations ✅ / in progress

1. ✅ Kill Replit Gmail → Lekker Mail / Zeptomail  
2. ✅ Kill Replit object sidecar → GCS ADC + Cloud Run env pins  
3. Pin secrets in `cloudbuild.yaml` so deploys do not drop mail/storage  

### Phase B — Directory enquiry product (this sprint)

1. Explicit **Enquire anonymously** default in Directory sheet  
2. Pass `privacy` through Chat BFF → Network `/api/v1/chat/enquiries`  
3. Provider payloads: first name only while contact hidden  
4. Enquiry thread: reveal phone (and email) when ready  
5. Copy: “Replies appear in Lekker Chat and their Marketplace portal”

### Phase C — Cledwyn unification

1. Non-lekkerpreneur → keep generalist (or Network consumer assistant)  
2. Verified + `lekkerWorkspaceId` → proxy to Network `POST /api/v1/cledwyn/chat`  
3. Drop `AI_INTEGRATIONS_OPENROUTER_*` as production requirement  
4. UI label: “Your business assistant” vs “Assistant”

### Phase D — Identity & Connect

1. Treat Network as identity SoT; Chat DB = messaging + device tokens keyed by Network id  
2. Wire `lib/connect-api` / bookings where native UX beats WebView  
3. Remove `DIRECTORY_DATA` stub in production  
4. Retire password routes; Settings email via ecosystem mail only  

### Phase E — Hygiene

1. iOS bundle id away from `app.replit.lekkerchatios`  
2. Delete stale root `routes.ts` / duplicate Expo trees  
3. Refresh HANDOVER + infra docs to Cloud Run–only  

---

## Ops checklist (Cloud Run)

| Env / secret | Purpose |
|--------------|---------|
| `INBOUND_API_KEY` | Lekker Mail transactional send |
| `SYSTEM_ZEPTOMAIL_API_KEY` | Optional fallback |
| `OBJECT_STORAGE_BACKEND=gcs` | Force ADC path |
| `PRIVATE_OBJECT_DIR` | `/lekkernetworkbucket/lekker-chat/private` |
| `PUBLIC_OBJECT_SEARCH_PATHS` | `/lekkernetworkbucket/lekker-chat/public` |
| `LEKKER_NETWORK_API_KEY` | Must match Network `MOBILE_API_KEY` |
| Twilio WhatsApp vars | Primary auth |

Service: `lekker-chat` · Region: `europe-west1` · Public: `https://chat.lekker.network`

---

## Decision log

| Date | Decision |
|------|----------|
| 2026-09-12 | Chat is Network-attached messaging, not a second OS |
| 2026-09-12 | Replace Replit Gmail/sidecar before Cledwyn unify |
| 2026-09-12 | Directory enquire default = hide phone/email, show **first name only** |
| 2026-09-12 | Instant Match opt-in ≠ Chat directory (`marketplace_leads_enabled` vs `directory_listed`) |

---

## Related docs

- Canonical product ref: `user knowledge/infra/LEKKER-CHAT.md`  
- Network mobile API: `LekkerNetworkV3/server/mobile-routes.ts` (`/api/v1/chat/enquiries`)  
- Lead privacy: `marketplace-lead-service.ts` → `presentLeadForProvider`  
- Events v2 consumer brief: `LekkerMarketplace/docs/events-v2-consumer-brief.md`  
