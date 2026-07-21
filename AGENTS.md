# AGENTS.md

## What this is

NexText — a React + Vite mobile-first chat app (JavaScript, not TypeScript). Firebase handles auth, Firestore, and hosting; Supabase handles media storage with a public anon client and RLS policies.

## Dev commands

```bash
npm run dev        # Vite dev server (http://localhost:5173)
npm run build      # Production build to dist/
npm run lint       # oxlint (no config flags needed)
npm run preview    # Preview production build locally
```

No test framework, no formatter, no typecheck. Lint is the only verification step.

## Architecture

- **Entry:** `src/main.jsx` → `src/App.jsx` (ThemeProvider wraps AppShell)
- **Screens:** `src/screens/*.jsx` — Auth, ChatList, Conversation, Privacy, ParentalControls, Feedback, ContactProfile, AdminDashboard, FindFriends, NewGroup
- **Firebase layer:** `src/firebase/` — config, useAuth hook, chats, contacts, presence, global config-settings
- **Supabase layer:** `src/supabase/` — config (public anon client), media upload/delete
- **Media compression:** `src/media/mediaCompression.js` — 50MB limit, image compression to 1080p JPEG
- **Theme system:** `src/theme/ThemeContext.jsx` — 15+ preset themes, custom color picker, auto-rotation on a schedule
- **Data model:** Firestore collections: `users/`, `chats/` (with `messages/` subcollection), `status/`, `reports/`, `feedback/`, `systemMessages/`, `broadcastLists/`, `config/`, `messageLimits/`

## Dual storage reality

- **Media files** (images, videos, voice notes, files) go to **Supabase Storage** (`chat-media` bucket), not Firebase Storage. Upload/delete handled by `src/supabase/media.js`. Path: `{chatId}/{uploaderUid}/{timestamp}-{filename}`.
- **Firebase Storage rules** exist in `storage.rules` but are not currently used for media — Supabase is the active media backend.
- The Supabase client in `src/supabase/config.js` uses a public anon key — no Firebase auth bridging.

## Key config files

| File | Purpose |
|------|---------|
| `firebase.json` | Hosting deploy config (serves from `dist/`, SPA rewrites), Firestore rules, Storage rules |
| `firestore.rules` | Server-side access control: chat participants, edit/delete windows, message limits, parental restrictions |
| `storage.rules` | Firebase Storage rules (currently secondary to Supabase) |
| `.oxlintrc.json` | Only `react/rules-of-hooks` (error) and `react/only-export-components` (warn) |

## Gotchas

- **No .env files.** Firebase and Supabase configs are hardcoded in `src/firebase/config.js` and `src/supabase/config.js`. The reCAPTCHA site key is a placeholder string — App Check stays inactive until replaced.
- **App is phone-sized by design.** Container is `maxWidth: 390px, height: 720px` with `uiScale` transform — don't add desktop layouts.
- **Chat IDs for direct chats** are deterministic: sorted UIDs joined by `_`. Group chats get random Firestore doc IDs.
- **Edit window:** 15 min from `sentAt`. **Delete-for-everyone window:** 60 hours. Both enforced server-side in `firestore.rules:47-54`.
- **Daily send limit:** 500 messages/24h, tracked in `messageLimits/{uid}` — counter is client-maintained (deterrent, not hard-enforced).
- **Presence** uses a 25s heartbeat interval; offline detection relies on `beforeunload` + visibility API — known limitation without a realtime disconnect service.
- **Admin role:** set manually in Firestore user document (`role: "admin"`), no in-app way to self-promote. Shows Admin Dashboard in Settings.
- **Firebase project:** `nextext-ddf38`. Deploy with `firebase use nextext-ddf38` then `firebase deploy --only ...`
- **Spark plan (free tier):** Cloud Functions cannot be deployed. The `functions/` directory is unused.
