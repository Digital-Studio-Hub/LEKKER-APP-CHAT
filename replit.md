# Lekker Chat

A business messaging app for Lekker Network - connecting Lekkerpreneurs with their customers.

## Stack
- **Frontend**: Expo React Native (Router v6, SDK 54)
- **Backend**: Express.js with TypeScript
- **AI**: OpenRouter (xAI Grok 3 Mini) via Replit AI Integrations for CledwynAI assistant
- **Storage**: AsyncStorage for local data persistence
- **Font**: Poppins (Google Fonts)

## Architecture

### Frontend (Expo)
- `app/index.tsx` - Login screen (phone number + name)
- `app/(tabs)/` - Main tab navigation
  - `index.tsx` - Chats list (WhatsApp-style conversations with pin, receipts, group support)
  - `cledwyn.tsx` - CledwynAI chat with streaming
  - `network.tsx` - Directory + WebView (toggle between Directory and Browse)
  - `feed.tsx` - Social feed with 24h rolling posts
- `app/chat/[id].tsx` - Individual/group chat conversation with sent/delivered/seen receipts
- `app/settings.tsx` - Settings (presence, privacy, auto-reply)
- `app/profile.tsx` - Profile with posts
- `app/new-chat.tsx` - Create new conversation (contacts integration + directory matching)
- `app/new-group.tsx` - Create group chat (two-step: select members, name group)
- `app/new-post.tsx` - Create feed post
- `app/post-comments.tsx` - View/add comments on posts
- `lib/storage.ts` - AsyncStorage data layer (conversations, messages, groups, pins, receipts)
- `lib/auth-context.tsx` - Authentication context
- `lib/query-client.ts` - React Query + API helpers

### Backend (Express)
- `server/routes.ts` - API endpoints:
  - `/api/cledwyn/chat` - CledwynAI streaming chat
  - `/api/directory` - Lekkerpreneur directory with filters (serviceType, province, search)
  - `/api/directory/:id` - Single directory entry
- `server/index.ts` - Express server setup
- Port 5000

## Features
- Phone number login with verification flow
- WhatsApp-style chat conversations (P2P and group)
- Group chat creation with member selection and naming
- Pin chats to top (long-press menu with pin/unpin/delete)
- Sent/delivered/seen message receipts (single check → double check → green double check)
- Auto-reply with customizable message and presets (Settings > Auto Reply)
- Device contacts integration (expo-contacts) with directory matching
- Invite non-users via SMS or WhatsApp
- CledwynAI assistant powered by Grok (streaming SSE)
- Lekkerpreneur Directory with location/service filters and direct chat start
- Lekkerpreneur verification badge (yellow checkmark) in chats and directory
- Lekker Network workspace WebView with persistent cookies
- Profile photo upload with camera/library picker
- Social feed with 24h rolling posts, duplicate detection
- Posts support likes, comments, and shares
- Shared posts persist beyond 24 hours
- Profile with status updates (online/away/DND/offline)
- Black & yellow Lekker branding

## Data Types
- `UserProfile` - id, phoneNumber, displayName, status, presence, avatarColor, profilePhoto, lekkerNetworkAccess, autoReplyEnabled, autoReplyMessage
- `Conversation` - id, contactId, contactName, messages[], pinned, isGroup, groupMembers[]
- `ChatMessage` - id, senderId, content, timestamp, read, status (sent/delivered/seen)
- `GroupMember` - id, name, phone, avatarColor

## Colors
- Primary: #F5B800 (Lekker Yellow)
- Background: #0D0D0D (Near Black)
- Card: #1A1A1A
- Text: #FFFFFF
