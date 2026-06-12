# Oliv — agent notes

iOS social food tracker (Expo SDK 56, RN 0.85, React 19, TS strict, expo-router v6).

## Commands
- `npm test` — full Jest suite (jest-expo preset)
- `npm run typecheck` — `tsc --noEmit`
- `npx expo export --platform web` — full-route Metro bundle check (no simulator on Linux)
- `node scripts/generate-icons.js` — regenerate app icons procedurally
- Backend deploy + the server-side key: `supabase/README.md`; architecture/roadmap: `docs/PRODUCTION.md`

## Architecture rules
- Layering: `app → components → store → services → domain`. `src/domain/` is pure TS (no React/IO) and is the only place business math lives.
- The Health Score algorithm (`src/domain/healthScore.ts`) is **normative** — spec §6 of `docs/PRODUCT_SPEC.md`. Don't tweak tiers/deltas without updating the spec table and the reference tests in `__tests__/domain/healthScore.test.ts` together. Score deltas accumulate in integer hundredths (float-tie safety) — keep it that way.
- All analyzer output flows through `validateAnalysis()` (clamps, macro-energy rescale + re-clamp, sub-nutrient caps) before scoring or saving.
- Client ids are RFC-4122 UUIDs from `newId()` — the backend's `uuid` columns reject anything else (22P02). Sync keeps a persisted pending-op log (`sync-ops`) that replays transient failures; permanent SQLSTATE errors are dropped.
- Stores persist via the microtask-coalesced `createPersister`; tests await `flushPersistence()`.
- Demo/social content is seeded **once** (`seedIfNeeded`) with stable IDs and persisted; never regenerate over existing data.
- Backend (Supabase) is **optional and gated** on `isBackendConfigured()` (the two `EXPO_PUBLIC_SUPABASE_*` env vars). When unset, the app is fully local/offline and the Supabase SDK must never load. Keep all Supabase access behind `src/services/sync.ts` (push helpers + `backendActive()`), which dynamic-imports `src/services/supabase/*`. Don't statically import the Supabase client from anything in the test/offline graph (analyzers, stores) — `proxyAnalyzer` and `sync` lazy-load it on purpose.
- The LLM key is **server-side** in `supabase/functions/analyze` (OpenAI gpt-5.5, provider-pluggable). The app calls the proxy via `ProxyMealAnalyzer`; precedence is `proxy → offline estimator` (the in-app Claude analyzer was removed). Meals carry up to 5 photos (`Meal.photoUris`, DB `photo_paths text[]`). `supabase/` is excluded from the app `tsconfig` (it's Deno).
- React Native Web gotchas the UI must respect: `Alert.alert` with buttons is a silent no-op (use `src/services/confirm.ts`), `blob:` URIs die on reload (photos persist as data URIs on web via `persistPhotos`), and a Pressable with `accessibilityRole="button"` must never wrap another button.

## Gotchas (hard-won)
- `@testing-library/react-native` v14: `render` and `fireEvent.*` are **async** — always `await` them.
- TypeScript 6: `@types/*` are not auto-included; `tsconfig.json` lists `"types": ["jest", "node"]`.
- `npx expo install` can't reach the Expo versions API on this network — pin versions from `node_modules/expo/bundledNativeModules.json` and plain `npm install` instead.
- expo-file-system uses the new `File`/`Paths` class API (`copySync`, `.exists`, `.delete()`); expo-image-manipulator uses the context API (`ImageManipulator.manipulate(...).renderAsync()` → `saveAsync`).
- gpt-5.5 is a reasoning model: image requests need `reasoning_effort: 'low'` + a generous `max_completion_tokens` or the whole budget burns on reasoning and content comes back empty (`finish_reason: "length"`).
- Jest can't run native dynamic `import()`; `babel.config.js` compiles it to `require()` in the test env only.
