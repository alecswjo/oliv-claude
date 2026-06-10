# Oliv — agent notes

iOS social food tracker (Expo SDK 56, RN 0.85, React 19, TS strict, expo-router v6).

## Commands
- `npm test` — full Jest suite (jest-expo preset)
- `npm run typecheck` — `tsc --noEmit`
- `npx expo export --platform web` — full-route Metro bundle check (no simulator on Linux)
- `node scripts/generate-icons.js` — regenerate app icons procedurally

## Architecture rules
- Layering: `app → components → store → services → domain`. `src/domain/` is pure TS (no React/IO) and is the only place business math lives.
- The Health Score algorithm (`src/domain/healthScore.ts`) is **normative** — spec §6 of `docs/PRODUCT_SPEC.md`. Don't tweak tiers/deltas without updating the spec table and the reference tests in `__tests__/domain/healthScore.test.ts` together. Score deltas accumulate in integer hundredths (float-tie safety) — keep it that way.
- All analyzer output flows through `validateAnalysis()` (clamps, macro-energy rescale, sub-nutrient caps) before scoring or saving.
- Stores persist via the microtask-coalesced `createPersister`; tests await `flushPersistence()`.
- Demo/social content is seeded **once** (`seedIfNeeded`) with stable IDs and persisted; never regenerate over existing data.

## Gotchas (hard-won)
- `@testing-library/react-native` v14: `render` and `fireEvent.*` are **async** — always `await` them.
- TypeScript 6: `@types/*` are not auto-included; `tsconfig.json` lists `"types": ["jest", "node"]`.
- `npx expo install` can't reach the Expo versions API on this network — pin versions from `node_modules/expo/bundledNativeModules.json` and plain `npm install` instead.
- expo-file-system uses the new `File`/`Paths` class API (`copySync`, `.exists`, `.delete()`); expo-image-manipulator uses the context API (`ImageManipulator.manipulate(...).renderAsync()` → `saveAsync`).
- The Claude analyzer model id is `claude-opus-4-8` with `output_config.format` structured outputs — both verified current; don't "fix" them to older patterns.
