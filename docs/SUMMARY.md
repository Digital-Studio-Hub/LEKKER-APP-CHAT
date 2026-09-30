# Lekker Chat — in-repo summary

Short record of shipped app work that already landed on `main`. Not a full product changelog.

---

## 2026-09-14 — Jo Android contacts / LTR / icon (1.1.6)

**Release:** app version **1.1.6**, Android `versionCode` **37**.  
**Merge:** squash-merge `e368e9a511491342ecc79410410f689396db3170` via [PR #6](https://github.com/Digital-Studio-Hub/LEKKER-APP-CHAT/pull/6).  
**Tracks:** GitHub issues [#1](https://github.com/Digital-Studio-Hub/LEKKER-APP-CHAT/issues/1) (parent), [#2](https://github.com/Digital-Studio-Hub/LEKKER-APP-CHAT/issues/2)–[#5](https://github.com/Digital-Studio-Hub/LEKKER-APP-CHAT/issues/5).

Jo (Admin WA, 11 Sep) reported Android bugs on SM-A013G. The code below is **already on `main`**. This file only documents it.

### Contacts (`app/new-chat.tsx`)

- Digit-normalized phone search so `082` matches `+27…` (and other digit-only queries ≥ 3 digits)
- `useFocusEffect` reloads contacts after returning from a Settings permission grant
- Nameless entries keep an **Unknown** display name instead of being dropped
- `keyboardShouldPersistTaps="handled"` on the contacts `SectionList`

### Contact / compose sheets (`app/_layout.tsx`)

Android uses `presentation: "modal"` instead of `formSheet` for:

- `new-chat`
- `new-group`
- `new-post`
- `post-comments`

Fixes the top-right contact icon and the sheet after permission. iOS still uses `formSheet`.

### Assistant / Cledwyn (LTR)

- Force LTR app-wide via `I18nManager` (`allowRTL` / `forceRTL` false) in `app/_layout.tsx`
- Related LTR styling (`direction` / `writingDirection`) on Cledwyn bubbles, header, and composer
- Related earlier empty-state FlatList / inverted-list fix already on `main` (`557c786`, 13 Sep) — Chat + Cledwyn empty states

### Icon / release bump (`app.json`)

- Version **1.1.6**, Android **versionCode 37**
- Adaptive icon background stays brand yellow `#F5B800`
- Dropped redundant `adaptiveIcon.backgroundImage`

### Still pending (ops, not code)

- Play install + device verify on **SM-A013G** serial `RZ8R70CJPDV`
- EAS production build/submit needs **Delano confirm** (cash lock)

Do **not** Publish from this docs PR.
