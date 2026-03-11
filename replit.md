# Lekker Chat

A business messaging app for Lekker Network - connecting Lekkerpreneurs with their customers.

## Stack
- **Frontend**: Expo React Native (Router v6, SDK 54)
- **Backend**: Express.js with TypeScript
- **Database**: PostgreSQL via Drizzle ORM
- **Auth**: JWT (jsonwebtoken) + bcrypt password hashing (12 rounds)
- **AI**: OpenRouter (xAI Grok 3 Mini) via Replit AI Integrations for CledwynAI assistant
- **Storage**: AsyncStorage for local data, SecureStore for auth tokens (native), PostgreSQL for users/auth
- **Font**: Poppins (Google Fonts)

## Architecture

### Frontend (Expo)
- `app/index.tsx` - Login/Register screen (email+password login, multi-field registration)
- `app/(tabs)/` - Main tab navigation
  - `index.tsx` - Chats list (WhatsApp-style conversations with pin, receipts, group support)
  - `cledwyn.tsx` - CledwynAI chat with streaming
  - `network.tsx` - Directory + WebView (toggle between Directory and Browse)
  - `feed.tsx` - Social feed with 24h rolling posts
- `app/chat/[id].tsx` - Individual/group chat conversation (server-backed via chat-api.ts)
- `app/settings.tsx` - Settings (profile photo upload, editable fields, presence, privacy, auto-reply)
- `app/profile.tsx` - Own profile with posts
- `app/user-profile/[id].tsx` - View another user's profile (name, bio, business info, posts)
- `app/new-chat.tsx` - Create new P2P chat (search registered users + directory contacts)
- `app/new-group.tsx` - Create group chat (search users, select members, name group)
- `app/in-app-browser.tsx` - In-app browser for opening links (WebView/iframe with nav controls)
- `app/new-post.tsx` - Create feed post
- `app/post-comments.tsx` - View/add comments on posts
- `lib/storage.ts` - AsyncStorage data layer (block/unblock, pins, local preferences)
- `lib/chat-api.ts` - Server-backed chat client (fetchChats, fetchChatMessages, createP2PChat, createGroupChat, sendChatMessage, markChatRead, deleteServerChat, searchUsers, getChatDetail, display helpers)
- `lib/auth-context.tsx` - Server-backed authentication context (JWT + SecureStore)
- `lib/auth-token.ts` - Singleton auth token accessor (breaks circular dependency)
- `lib/query-client.ts` - React Query + API helpers with Authorization headers
- `lib/notifications.ts` - Push notification service (expo-notifications)
- `lib/location.ts` - Location services (expo-location)
- `lib/chat-attachments.ts` - Chat attachment utilities (image, camera, file, voicenote, location, poll, contact)
- `client/utils/objectStorageExpo.ts` - Presigned URL upload utility for Replit Object Storage

### Backend (Express)
- `server/routes.ts` - API endpoints:
  - `/api/auth/register` - Account registration (phone, email, username, firstName, lastName, password)
  - `/api/auth/login` - Login via email/phone + password, returns JWT
  - `/api/auth/me` - Get current user profile (protected)
  - `/api/auth/profile` - Update user profile (protected)
  - `/api/auth/logout` - Logout with audit logging (protected)
  - `/api/objects/upload` - Get presigned upload URL (protected, rate-limited)
  - `/api/user/profile-image` - Set/remove profile image via object storage (protected, rate-limited)
  - `/objects/*` - Serve objects from storage (public ACL checked)
  - `/public-objects/*` - Serve public objects from storage
  - `/api/auth/sync-lekker` - Manual sync with Lekker Network API (protected)
  - `/api/v1/verify-user` - Incoming endpoint for lekker.network to verify a user exists in Lekker Chat (API key auth, email/phone lookup)
  - `/api/v1/network` - Secured network: verified Lekkerpreneurs only, paginated, no sensitive fields (protected, rate-limited)
  - `/api/cledwyn/chat` - CledwynAI streaming chat
  - `/api/directory` - Lekkerpreneur directory with filters (serviceType, province, search)
  - `/api/directory/:id` - Single directory entry
- `server/auth.ts` - JWT + bcrypt auth utilities, authMiddleware
- `server/storage.ts` - PostgreSQL storage via Drizzle ORM (PgStorage class)
- `server/lekkerNetwork.ts` - Lekker Network API client (directory fetch, user matching by phone/email, profile extraction, workspace data resolution, buildSyncUserResponse, buildDirectoryEntry)
- `server/objectStorage.ts` - Object Storage service (upload URLs, ACL, file serving)
- `server/objectAcl.ts` - Object ACL management (owner, visibility policies)
- `server/index.ts` - Express server setup
- Port 5000

### Database (PostgreSQL)
- `shared/schema.ts` - Drizzle schema definitions
  - `users` table - Full user profile with auth fields (phone, email, username, passwordHash, etc.)
  - `auth_audit_logs` table - Auth event logging (login, logout, failed attempts)
  - Zod validation schemas: registerSchema, loginSchema, updateProfileSchema, passwordSchema
- Unique constraints on phone, email, username

## Auth System
- Registration: phone + email + username + firstName + lastName + password (with strength validation)
- Login: email/phone identifier + password
- JWT tokens signed with SESSION_SECRET env var (required, no fallback)
- Token expiry: 7 days
- Password requirements: min 8 chars, 1 uppercase, 1 number, 1 special char
- Rate limiting: 10 login attempts / 15 min, 5 register attempts / hour
- Token storage: expo-secure-store on native (Keychain/Keystore), AsyncStorage on web
- Auth audit logging for all auth events

## Features
- Lekker Network API integration: matches users by phone/email on register/login, auto-populates business data + workspace ID for verified Lekkerpreneurs, manual sync via Settings, workspace detail endpoint (/api/v1/workspaces/:id) provides full business profile (plan, billing, team size, active services, verified domains)
- Production auth with registration and login
- Server-backed real-time chat (P2P and group) via PostgreSQL
- Message edit & delete: edit your sent text messages (shows "edited" label), delete messages for everyone (shows "This message was deleted")
- Group chat creation with member selection and naming
- Pin chats to top (long-press menu with pin/unpin/delete)
- Sent/delivered/seen message receipts (single check → double check → green double check)
- Auto-reply with customizable message and presets (Settings > Auto Reply)
- Device contacts integration (expo-contacts) with directory matching
- Invite non-users via SMS or WhatsApp
- CledwynAI assistant powered by Grok (streaming SSE) with personalized user/workspace context from Lekker Network
- Lekkerpreneur Directory with location/service filters and direct chat start
- Lekkerpreneur verification badge (yellow checkmark) in chats and directory
- Lekker Network workspace WebView with persistent cookies
- Profile photo upload with camera/library picker
- Social feed with 24h rolling posts, duplicate detection
- Posts support likes, comments, and shares
- Shared posts persist beyond 24 hours
- Profile with status updates (online/away/DND/offline)
- Push notifications for new messages (expo-notifications)
- Location services to find nearby Lekkerpreneurs (expo-location)
- Block/unblock users (long-press menu, chat header, Settings > Blocked Users)
- Chat attachments: images (gallery), camera photos, file uploads, voice notes, location sharing, polls, contact sharing
- Voice note recording with playback in chat bubbles
- Poll creation with voting and percentage results
- Web-safe location sharing (browser geolocation API on web, expo-location on native)
- Permission denied handling with Settings deep-link on native
- User profile view (tap name in chat header or directory entry to see their profile, posts, and business info)
- In-app browser for opening links (WebView on native, iframe on web) instead of system browser
- Google Programmable Search Engine (CSE cx=a4df62a18cab149ef) in Network > Search tab with Lekker-branded dark theme
- Network tab has 3 sub-tabs: Directory, Search, Browse (Browse requires lekkerNetworkAccess)
- Search result links open in the in-app browser
- Black & yellow Lekker branding

## Data Types
- `AuthUser` (server-backed) - id, phone, email, username, firstName, lastName, role, avatarColor, profilePhoto, bio, businessName, tradingName, lekkerNetworkId, isVerifiedLekkerpreneur, businessCategory, businessWebsite, businessLogoUrl, businessProvince, businessCountry, lekkerVerifiedAt, status, presence, lekkerNetworkAccess, autoReplyEnabled, autoReplyMessage, notificationsEnabled, locationEnabled, lastLatitude, lastLongitude, locationCity, locationRegion, emailVerified, phoneVerified, createdAt, updatedAt + enriched: displayName, phoneNumber
- `Conversation` - id, contactId, contactName, messages[], pinned, isGroup, groupMembers[]
- `ChatMessage` - id, senderId, content, timestamp, read, status (sent/delivered/seen), type (text/image/file/voicenote/location/poll/contact), imageUri, fileUri, fileName, fileSize, audioUri, audioDuration, latitude, longitude, locationName, pollQuestion, pollOptions[], sharedContactName, sharedContactPhone
- `PollOption` - id, text, votes[]
- `GroupMember` - id, name, phone, avatarColor
- `BlockedUser` - id, name, phone, blockedAt

## Performance Optimizations (Low-bandwidth SA / Samsung A52)
- Polling intervals: Chats list 5s (was 3s), Chat detail 4s (was 2s)
- Directory API: 60s in-memory cache via `fetchDirectoryCached()` in `lib/query-client.ts`
- FlatList: `maxToRenderPerBatch`, `windowSize`, `removeClippedSubviews`, `initialNumToRender` on all list screens
- `React.memo` on MessageBubble component to avoid re-renders
- Image compression: quality 0.5 (was 0.7) for gallery/camera attachments
- Server gzip: `compression` middleware on Express backend
- React Query: retry 2 with exponential backoff (1s, 2s, 4s max 10s)
- Directory network tab: 15s fetch timeout with 2 auto-retries on failure

## Device Compatibility & Responsive Design
- Expo SDK 54 minimum: iOS 15.1+, Android 6.0+ (Marshmallow)
- `lib/responsive.ts` - Responsive scaling utilities based on 375pt reference width
  - Exports: `scale`, `moderateScale`, `fontScale`, `isSmallScreen` (<360pt), `isMediumScreen`, `isLargeScreen`, `responsivePadding`, `responsiveAvatarSize`, `responsiveMaxBubbleWidth`, `screenWidth`, `screenHeight`
- Applied across all screens: login, chats list, chat detail, cledwyn AI, network/directory, feed, settings, profile
- Minimum touch targets: 44×44pt on all interactive elements
- Font scaling via `fontScale()` for readability on small screens
- Chat bubble max width adapts to screen size via `responsiveMaxBubbleWidth()`
- Image attachments scale down on small screens (160×160 vs 200×200)
- Accessibility: `accessibilityLabel`, `accessibilityHint`, `accessibilityRole`, `testID` on key form inputs and buttons
- Web platform insets: 67px top, 34px bottom (handled in each screen)
- `supportsTablet: true` in app.json

## Environment Variables
- `SESSION_SECRET` - Required. Used for JWT token signing. Must be set before server starts.
- `DATABASE_URL` - PostgreSQL connection string (auto-provisioned by Replit)
- `AI_INTEGRATIONS_OPENROUTER_BASE_URL` - OpenRouter API base URL
- `AI_INTEGRATIONS_OPENROUTER_API_KEY` - OpenRouter API key
- `DEFAULT_OBJECT_STORAGE_BUCKET_ID` - Replit Object Storage bucket ID (auto-provisioned)
- `PUBLIC_OBJECT_SEARCH_PATHS` - Public object search paths (auto-provisioned)
- `PRIVATE_OBJECT_DIR` - Private object directory (auto-provisioned)
- `LEKKER_NETWORK_API_KEY` - API key for lekker.network Lekkerpreneur directory API
- `LEKKER_NETWORK_API_URL` - Base URL for Lekker Network API (default: https://lekker.network/api/v1/lekkerpreneurs)

## Colors
- Primary: #F5B800 (Lekker Yellow)
- Background: #0D0D0D (Near Black)
- Card: #1A1A1A
- Text: #FFFFFF
