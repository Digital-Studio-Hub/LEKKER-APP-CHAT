# Dead / duplicate roots (follow-up)

Expo Router live tree is **`app/`**. Express live routes are **`server/routes.ts`**.

## Quarantined (done)

| Path | Notes |
|------|--------|
| `server/_dead/routes.root.ts` | Former root `routes.ts` (~1.9k lines). **Not mounted.** Banner comment at top. |

## Remaining root duplicates (not moved — Metro / Expo safety)

These sit at repo root beside `app/` and are listed in `.gitignore` (“Accidental root copies”). Do **not** edit them; live copies are under `app/`, `lib/`, `shared/`, `constants/`, or `server/`.

| Root path | Likely live counterpart |
|-----------|-------------------------|
| `(tabs)/` | `app/(tabs)/` |
| `_layout.tsx` | `app/_layout.tsx` |
| `+native-intent.tsx` | `app/+native-intent.tsx` |
| `+not-found.tsx` | `app/+not-found.tsx` |
| `index.tsx` | `app/index.tsx` |
| `settings.tsx` | `app/settings.tsx` |
| `new-chat.tsx` | `app/new-chat.tsx` |
| `new-group.tsx` | `app/new-group.tsx` |
| `new-post.tsx` | `app/new-post.tsx` |
| `post-comments.tsx` | `app/post-comments.tsx` |
| `profile.tsx` | `app/profile.tsx` |
| `in-app-browser.tsx` | `app/in-app-browser.tsx` |
| `chat/` | `app/chat/` |
| `user-profile/` | `app/user-profile/` |
| `colors.ts` | `constants/colors.ts` |
| `safety-api.ts` | `lib/safety-api.ts` |
| `safety.ts` | `constants/safety.ts` |
| `schema.ts` | `shared/schema.ts` |
| `storage.ts` | `server/storage.ts` / `lib/storage.ts` |
| `landing-page.html` | `server/templates/landing-page.html` |

**Follow-up:** After confirming Metro never resolves these (expo-router `app/` only), move them to `server/_dead/expo-root-dupes/` preserving filenames, or delete if identical to live trees.
