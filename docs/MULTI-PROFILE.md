# Multi-profile (same install)

Lekker Chat keeps today’s WhatsApp OTP login as the **primary profile**. A second verified number can be added on the same install and switched without reinstalling.

Each profile is its own Chat user (unique phone) with its own JWT. Tokens are stored separately on the device (`lekker_pt_<profileId>` in SecureStore, or AsyncStorage on web). The active token is still mirrored to `lekker_auth_token` so the existing single-profile path keeps working.

## What is isolated

| Surface | How |
|---|---|
| Chats, mail, feed API calls | `Authorization` uses the active profile’s JWT. Inboxes clear when `user.id` changes. |
| Push | The device Expo token is unregistered from the previous user and registered for the active user. `push_tokens.expo_push_token` is unique, so one install receives pushes for the active profile only. |
| Cledwyn transcript + Network `sessionId` | AsyncStorage keys are suffixed with the Chat profile id. A second profile does not read the first profile’s thread. |
| Personal care PIN / companion cache | Scoped the same way. Legacy unscoped keys migrate once onto the primary profile. |
| Software WebView | Session resets when the active profile or its `lekkerWorkspaceId` changes, then SSO is minted again. |

Workspace switching inside lekker.network stays available. The profile only pins a **default** workspace for Cledwyn and the first Software SSO. Membership in other workspaces is a Network concern.

## Chat API

### `GET /api/profiles/binding`

Auth: Bearer JWT of the **active** profile.

```json
{
  "binding": {
    "profileId": "chat-user-uuid",
    "phone": "+27...",
    "defaultWorkspaceId": "workspace-id-or-null",
    "lekkerNetworkId": "network-user-id-or-null",
    "networkMembershipsAvailable": false,
    "memberships": []
  }
}
```

`profileId` is the Chat user id (one per WhatsApp number). `defaultWorkspaceId` is `users.lekker_workspace_id`. `networkMembershipsAvailable` stays `false` until Network lists memberships.

### `PUT /api/profiles/binding`

```json
{ "defaultWorkspaceId": "workspace-id" }
```

`null` or `""` clears the pin. Ids must match `^[A-Za-z0-9_-]{1,100}$`.

Chat does **not** check Network membership. A later OTP login does not overwrite a workspace id that is already set. Settings → Sync Lekker Network still refreshes it from the phone match.

### `GET /api/lekker/session-token`

Response now also includes `profileId`, `phone`, `defaultWorkspaceId`, and `lekkerNetworkId` for the active profile. The SSO URL is unchanged.

## Network API contract (parallel PR)

Chat calls these today. Extra fields are optional. If `POST /api/v1/mobile/session-token` rejects an enriched body, Chat retries with `{ userId }` only.

### Already sent

`POST /api/v1/mobile/session-token`

```json
{
  "userId": "<lekkerNetworkId>",
  "workspaceId": "<defaultWorkspaceId>",
  "chatProfileId": "<Chat user id>",
  "phone": "+27..."
}
```

`POST /api/v1/cledwyn/chat` (workspace mode) already sends `userId` (Network id) and `workspaceId`. Chat now keeps `sessionId` per Chat profile so personal and business threads are not reused locally.

### Network should

1. Treat `workspaceId`, `chatProfileId`, and `phone` on session-token as optional. Open the bound workspace as the active workspace, and still allow the Network user to switch to other workspaces they belong to.
2. Key Cledwyn memory, tools, and `sessionId` by `(userId, workspaceId)`. Reject or ignore a `sessionId` that belongs to a different workspace. Do not bleed tools or memory across workspaces.
3. Reject Cledwyn and session establishment when `userId` is not a member of `workspaceId` (403). Chat stores the pin without a membership check.
4. Add a membership list so Chat can stop asking the user to paste a workspace id:

`GET /api/v1/mobile/workspaces?userId=<lekkerNetworkId>`

```json
{
  "workspaces": [
    { "id": "ws_personal", "name": "Personal", "role": "owner" },
    { "id": "ws_business", "name": "Business", "role": "member" }
  ]
}
```

When this exists, Chat can set `networkMembershipsAvailable: true` and fill `memberships` on `GET /api/profiles/binding`. No customer-specific ids belong in this contract.

## Manual test

1. **Single number (unchanged).** Install or open the app, sign in with one WhatsApp OTP. Chats, Cledwyn, and Settings behave as before. Settings → Profiles shows one primary row and “Add another number”. Sign out returns to the login screen.
2. **Add a second number.** Settings → Add another number. Request a code for a different WhatsApp number and verify. The app switches to that profile. The first number remains in the list.
3. **Switch.** From Chats (the “switch” line) or Settings, switch back. The inbox reloads. Messages from the other number are not listed. Repeat on Cledwyn: the previous profile’s transcript and session are not shown.
4. **Push.** With profile A active, a message to A notifies this device. A message to B does not, until you switch to B (the Expo token moves to the active user).
5. **Workspace pin.** On the business profile, set Default workspace to that workspace id and save. Cledwyn workspace mode and Software SSO use it. Switch to the personal profile and confirm its own workspace id is unchanged. Inside Software you can still change workspace if Network lets that user do so.
6. **Remove.** Remove the second profile from the phone. The first profile remains signed in. Sign out of the last profile returns to login.

Automated checks: `npm run test:profiles`.
