# Shipping Oliv to TestFlight

Everything in the repo is already configured for this — bundle id
(`app.oliv.tracker`), encryption flag, privacy manifests, and `eas.json` build
profiles. You run the commands below **from your Mac** (the project must be
cloned and `npm install`ed). EAS builds in the cloud, so you do **not** need
Xcode. Apple authentication happens in your browser — no secrets are stored in
the repo.

## Prerequisites (one-time)

- **Apple Developer Program** membership — active (not just paid; status at
  developer.apple.com/account must read active).
- **A free Expo account** — https://expo.dev/signup.
- `npm install -g eas-cli`

## 1. Log in

```bash
eas login                      # your Expo account
```

## 2. Build the iOS app

```bash
eas build --platform ios --profile production
```

First run, EAS will:
- offer to **create an EAS project** for the app → yes. It writes
  `extra.eas.projectId` into `app.json` — **commit that change**.
- ask to **generate signing credentials** (Distribution Certificate +
  Provisioning Profile) → yes, let EAS manage them.
- prompt you to **log into Apple** (Apple ID + password + 2FA). If you belong to
  more than one team, pick the one your membership is under.

The build runs ~15–25 min in the cloud and produces a signed `.ipa`.

## 3. Submit to TestFlight

```bash
eas submit --platform ios --latest
```

- Logs into Apple again (or reuses the session).
- Since the app doesn't exist in App Store Connect yet, it **offers to create
  the app record** → yes. (Name "Oliv", bundle id `app.oliv.tracker`.)
- Uploads the build.

> After the first submit, grab the app's numeric **Apple ID** from App Store
> Connect → your app → **App Information → Apple ID**, and (optionally) put it in
> `eas.json` under `submit.production.ios.ascAppId` so future submits are
> non-interactive.

## 4. App Store Connect → get it on a phone

appstoreconnect.apple.com → **Apps → Oliv → TestFlight**.

1. The build shows **"Processing"** for ~5–15 min, then becomes available.
   Export compliance is pre-answered (`ITSAppUsesNonExemptEncryption: false`), so
   it shouldn't ask.
2. Add a tester — two options:
   - **Internal testing (fastest, no review):** add the person under **Users and
     Access** (they need an Apple ID), then add them to the Internal Testing
     group. Build is available to them immediately.
   - **External testing (a link you can text):** create an External group, add
     their email **or** enable a **public link**. The **first** external build
     needs a one-time **Beta App Review** (usually a few hours).
3. The tester installs the **TestFlight** app from the App Store, opens the
   invite (or link), and taps **Install**. No Expo Go involved.

## Backend: what the tester will see

The `production` profile has **no env block**, so the build ships **offline**:
the app needs no sign-in, analyzes meals with the on-device estimator, and seeds
demo social content. Great for a first share.

To ship a build wired to the live Supabase backend (real AI analysis, accounts,
sync), add the two **public** vars to the production profile in `eas.json` and
rebuild:

```jsonc
"production": {
  "autoIncrement": true,
  "channel": "production",
  "env": {
    "EXPO_PUBLIC_SUPABASE_URL": "https://<project>.supabase.co",
    "EXPO_PUBLIC_SUPABASE_ANON_KEY": "sb_publishable_..."
  }
}
```

The OpenAI key is **never** here — it stays a Supabase Edge Function secret. See
`supabase/README.md`.

## Faster builds while iterating

Once a build is on TestFlight, JS-only changes can ship without a full rebuild:

```bash
eas update --channel production --message "tweak copy"
```

Native changes (new native module, app config, icons) still need
`eas build`.

## Common snags

- **"active membership" / credential errors** → the Developer Program isn't
  fully active yet, or you picked the wrong team at the Apple prompt.
- **Icon rejected** → the 1024×1024 icon must have no alpha channel
  (`node scripts/generate-icons.js` produces compliant icons).
- **`eas submit` fails citing `ascAppId`** → make sure `eas.json` has
  `"ios": {}` (no placeholder string), so submit creates the app interactively.
