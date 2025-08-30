# MyPantry (Expo React Native)

Pantry tracker with barcode scanning, local SQLite persistence, recipe browsing (TheMealDB), and optional Supabase auth/sync.

## Tech stack
- **Expo 53** (React Native)
- **SQLite (expo-sqlite)** for local data (schema & migrations in `src/db/db.js`)
- **Expo Camera** for barcode scan → result modal → save
- **React Navigation** (bottom tabs + native stacks)
- **NativeWind/Tailwind** utility styling
- **APIs:** OpenFoodFacts (OFF), UPCItemDB (fallback), USDA FoodData Central (FDC), TheMealDB
- **Supabase** (optional) for auth + pull/push sync
- **Jest + jest-expo** with mocks for native modules and network


## 1) Getting started

### Prerequisites
- Node 18+ and npm (or yarn/pnpm)
- Expo CLI (`npm i -g expo` is optional but convenient)
- One of:
  - **Android**: Android Studio + an emulator, or a physical device with Expo Go
  - **iOS**: Xcode + Simulator (macOS), or a physical device with Expo Go
  - **Web**: A modern browser (feature coverage differs)

### Install dependencies
```bash
npm install
# or: yarn install / pnpm install
```

### Environment variables
This app reads **public** runtime keys from environment variables (Expo will inline variables that start with `EXPO_PUBLIC_`). You can set them in your shell or a `.env` file (if you use a loader), or add them to `app.json` `expo.extra`.

Required for full functionality (barcode lookups + Supabase):
```bash
# Product/nutrition lookups
export EXPO_PUBLIC_FDC_API_KEY="your_usda_fdc_key"         # used by src/api/products.js
export EXPO_PUBLIC_UPCITEMDB_API_KEY="your_upcitemdb_key"  # optional fallback

# Supabase (auth + sync)
export EXPO_PUBLIC_SUPABASE_URL="https://YOUR-PROJECT.supabase.co"
export EXPO_PUBLIC_SUPABASE_ANON_KEY="your_anon_key"
```

**Alternative:** Add an `extra` block to `app.json`:
```json
{
  "expo": {
    "extra": {
      "APP_NAME": "MyPantry",
      "APP_EMAIL": "you@example.com",
      "FDC_API_KEY": "your_usda_fdc_key",
      "UPCITEMDB_API_KEY": "your_upcitemdb_key"
    }
  }
}
```
`src/api/products.js` uses `expo-constants` to read `expo.extra` as well as `process.env.EXPO_PUBLIC_*`.


## 2) Run the app

Start Metro and choose your target:
```bash
npm start
# then press: a (Android) | i (iOS) | w (Web)
```

Convenience scripts:
```bash
npm run android   # expo start --android
npm run ios       # expo start --ios
npm run web       # expo start --web
```

If the bundler stalls after dependency changes, try clearing cache:
```bash
expo start -c
```

### Login / Sync
- Auth & profile screens call Supabase RPCs defined on your backend.
- Session tokens are stored with Expo SecureStore (see `src/api/auth.js`).
- Sync uses RPCs `pantry_push`/`pantry_pull` and `favs_push`/`favs_pull` (see `src/sync/sync.js`).


## 3) Project structure (high level)

```
MyPantry/
├── app.json
├── package.json
├── jest.setup.js
├── src/
│   ├── api/
│   │   ├── products.js   # OFF → FDC → UPCItemDB lookups & caching
│   │   ├── recipes.js    # TheMealDB adapter
│   │   ├── auth.js       # Supabase auth RPCs + SecureStore
│   │   └── profile.js    # Supabase profile_update RPC
│   ├── db/
│   │   └── db.js         # SQLite schema, migrations, UPC cache, favourites
│   ├── lib/
│   │   └── supabase.js   # createClient(EXPO_PUBLIC_SUPABASE_URL, ...)
│   ├── sync/
│   │   └── sync.js       # pantry/favourites pull/push, cursors
│   └── screens/...       # tabs, stacks (Pantry, Scan, Meals, Profile, Settings, Auth)
└── __tests__/            # Jest tests (see below)
```


## 4) Running tests

This repo ships with **jest-expo** and mocks for native modules so you can run tests in Node without a device. The test watcher is enabled by default.

Run all tests:
```bash
npm test
```

Run once (CI-friendly):
```bash
npm test -- --watchAll=false
```

### What’s covered
- `__tests__/db.test.js` — SQLite repo (CRUD, migrations), UPC cache TTL, favourites, dirty flags, push markers, pull cursors.
- `__tests__/products.normalize.test.js` — normalisers for OFF, FDC, UPCItemDB.
- `__tests__/products.lookup.test.js` — cache-first lookup; OFF → UPCItemDB → FDC fallbacks; `bypassCache`; HTTP error surfacing.
- `__tests__/recipes.test.js` — TheMealDB adapter: `search.php?s=`, `lookup.php?i=`, `filter.php?c=`, `categories.php`; handles `meals:null` and non-OK responses.
- `__tests__/auth.test.js` — Supabase auth RPCs + SecureStore: register/login/token/logout/me; reset-password flows.
- `__tests__/profile.test.js` — `profile_update` RPC behaviour.
- `__tests__/sync.test.js` — sync pipeline: `skipped: offline`, `skipped: no-token`, happy path push/pull, per-section error reporting.

### Test environment notes
- `jest.setup.js` provides mocks for `expo-sqlite`, `expo-constants`, `expo-secure-store`, etc. It also seeds test keys so FDC/UPCItemDB code paths are enabled during unit tests.
- If adding new native modules, extend the mocks in `jest.setup.js` to keep tests hermetic.


## 5) Troubleshooting

- **Android emulator can’t connect**: ensure emulator has network; restart ADB; try `adb reverse tcp:8081 tcp:8081`.
- **iOS stuck on splash**: stop Metro and run with `expo start -c`.
- **Env vars not picked up**: confirm they start with `EXPO_PUBLIC_` or are present in `expo.extra`.
- **Jest fails on native module**: mock it in `jest.setup.js` and add to `transformIgnorePatterns` if needed.
