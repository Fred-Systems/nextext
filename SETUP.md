# NexText — Real Build Setup Guide

This covers the manual steps in Firebase/Google Cloud Console that I can't do for you,
plus what to do once your card is linked tomorrow.

---

## 0. Testing what's built so far (do this first)

You'll need **Node.js** installed on your computer if you don't have it already —
download from **nodejs.org** (choose the "LTS" version), it's a straightforward installer.

Once Node is installed, open a terminal (Command Prompt / PowerShell on Windows,
Terminal on Mac) in the folder where you've unzipped/saved this project, and run:

```bash
npm install
```

This downloads all the packages the app needs (only needs to be done once). Then:

```bash
npm run dev
```

This starts the app locally — it'll print a URL like `http://localhost:5173`. Open that
in your browser and you should see the real sign-in screen.

### Deploying the security rules (required before sign-up will fully work)

The app needs its Firestore security rules actually deployed to your Firebase project,
or all reads/writes will be rejected. One-time setup:

```bash
npm install -g firebase-tools
firebase login
```

This opens a browser window asking you to sign into the same Google account you used
for the Firebase project. Then, from inside the project folder:

```bash
firebase use nextext-ddf38
firebase deploy --only firestore:rules
```

That's it — rules are live. (Storage rules will deploy the same way, but only after
billing is linked tomorrow: `firebase deploy --only storage:rules`)

### Testing with two accounts (no second person needed)

1. Sign up in your normal browser window as yourself
2. Open a **second, incognito/private window** and sign up again using an email trick —
   if your email is `you@gmail.com`, use `you+test@gmail.com` (Gmail delivers both to
   the same inbox, but Firebase treats them as separate accounts)
3. In one window, search for and add the other account as a contact
4. In the other window, the contact request appears under **Pending Requests** with an
   **Accept** button — tap it, and the chat becomes available on both sides
5. Open the chat from either window and message back and forth — you should see
   messages, reactions, typing indicators, and read receipts sync live between the
   two windows

---

## 1. Tomorrow: Link billing (enables Storage)

1. Firebase Console → your project → gear icon → **Usage and billing**
2. Click **Modify plan** → choose **Blaze**
3. Link a Cloud Billing account (this is where the card goes)
4. Once linked, go back to **Build → Storage → Get started** — it'll now work

**Nothing else changes.** The app code is already written to use Storage; it simply
starts working the moment this is done.

---

## 2. Storage lifecycle rule (guaranteed 30-day cleanup, server-side)

This is a Google Cloud Storage setting that permanently deletes anything under
`/chats/` older than 30 days — completely independent of the app itself, so it's a
guaranteed backstop even if the in-app cleanup logic never runs for some chat.

**Via Console (no extra installs needed):**
1. Go to **console.cloud.google.com** → **Cloud Storage → Buckets**
2. Click your bucket (`nextext-ddf38.firebasestorage.app`)
3. Go to the **Lifecycle** tab → **Add a rule**
4. **Action:** Delete
5. **Object conditions:** Age = 30 days
6. Under "Scope to a specific object prefix," enter `chats/`
7. Save

The `storage-lifecycle.json` file in this project is the equivalent config, provided
in case you ever want to apply it via the `gsutil` command-line tool instead:
```bash
gsutil lifecycle set storage-lifecycle.json gs://nextext-ddf38.firebasestorage.app
```
(This requires installing Google Cloud's `gsutil` tool separately — the Console
click-through above achieves the exact same thing with no extra installs, so that's
the recommended path for now.)

---

## 3. Set a budget + connect the safety-net function

This is the "stop everything if spend gets out of hand" protection.

1. Go to **console.cloud.google.com** (Google Cloud Console, not Firebase Console —
   same account, different dashboard) → select your `nextext-ddf38` project
2. Left menu → **Billing → Budgets & alerts → Create budget**
3. Set an amount — I'd suggest starting at **$5 or $10/month** given your expected
   friends-and-family scale
4. Under **Actions** → enable **"Connect a Pub/Sub topic to this budget"**
5. Create a new topic named exactly: `budget-alerts`
6. Save

Once that's done, tell me, and I'll deploy the `disableBillingOnBudgetAlert` function
(already written in `functions/index.js`) — it listens on that exact topic name and will
automatically disable billing the moment your spend crosses the number you set in step 3.

**Important:** after it fires once, billing stays off until you manually turn it back on
in the Cloud Console — that's intentional, it's a hard stop, not a soft warning.

---

## 4. App Check (bot/script protection) — optional but recommended

1. Firebase Console → **Build → App Check**
2. Click **Get started**, register your web app
3. Choose **reCAPTCHA v3** as the provider (free)
4. It'll generate a **site key** — copy it
5. Send it to me, and I'll drop it into `src/firebase/config.js` in place of the
   placeholder — one line change, already wired to activate automatically

This step can wait until after you've tested the core app — it doesn't block anything
else from working.

---

## 5. Deploying rules and functions (I'll do this with you when ready)

Once you have the Firebase CLI concepts explained (I'll walk you through installing
`firebase-tools` and logging in), deploying is three commands:

```bash
firebase deploy --only firestore:rules
firebase deploy --only storage:rules
firebase deploy --only functions
```

I'll guide you through each when we get to that point — no need to worry about this yet.

---

## 6. Making yourself an admin (to see the Admin Dashboard)

The Admin Dashboard only shows up in Settings for accounts with `role: "admin"` —
and there's deliberately no in-app way to grant that to yourself or anyone else
(so a user could never self-promote). To make your own account an admin:

1. Firebase Console → **Build → Firestore Database**
2. Find your user document under the `users` collection (matches your account's uid —
   you can find your uid in the Firebase Console's **Authentication** tab, listed next
   to your email)
3. Click into that document, find the `role` field, change it from `"user"` to `"admin"`
4. Refresh the app — the Admin Dashboard entry should now appear in Settings

---

## What's already done vs. what's next

**Done:**
- Firebase project connected (`src/firebase/config.js`)
- Firestore security rules written, matching the full data model
- Storage security rules written
- Budget safety-net Cloud Function written (needs the Pub/Sub topic from step 2 to activate)

**Next:**
- Wire up the actual screens (auth, chat list, conversation, etc.) to real Firebase
  calls, replacing the mock data from the prototype
- Test in a browser together
- Package for Android via Capacitor
