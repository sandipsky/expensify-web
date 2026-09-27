# CLAUDE.md

Personal income/expense/transfer tracker. This repo is the **Angular web app (phase 1)**, a responsive PWA on Firebase. A native Kotlin Android app (phase 2) will read and write the **same Firestore data**, so the data model and business rules are a cross-platform contract.

**The spec is `docs/requirements.md`.** Read the relevant section before implementing a feature. Section refs below (§N) point into it.

## Current state

Fresh Angular 22 CLI scaffold: `src/app/app.html` is the CLI placeholder page and `app.routes.ts` is empty. Not yet installed: Angular Material/CDK, Firebase JS SDK, date-fns, PapaParse, `@angular/pwa`, ESLint (angular-eslint), Playwright, Firebase Emulator Suite, i18n. Next milestone is **M0 Setup** (§15).

The spec assumes a monorepo (`web/`, `android/`, `functions/`, `firebase/`, `spec/`). Here the web app lives at the repo root, so `web/src/app/...` in the spec means `src/app/...` here. Shared artifacts (`firestore.rules`, `storage.rules`, `firestore.indexes.json`, `spec/default-categories.json`, `spec/test-vectors/*.json`) don't exist yet. **Ask where they should live before creating them.**

## Commands

```bash
npm start                                   # ng serve → http://localhost:4200
npm run build                               # production build (default config) → dist/
npm test                                    # Vitest via @angular/build:unit-test
npx ng test --watch=false                   # single run (CI)
npx ng test --include=src/app/core/domain/money.spec.ts   # one file
npx prettier --check .                      # format check (printWidth 100, single quotes)
```

Build budgets (`angular.json`): initial bundle warns at 500 kB (NFR-02) and errors at 1 MB. Component styles warn at 4 kB and error at 8 kB.

## Non-negotiable business rules (§4, §8)

Getting these wrong corrupts balances or breaks Android parity.

- **Money is integer minor units** (12.50 → `1250`), never floats (BR-01). `amount` is always a positive integer, and `type` gives the direction (BR-02). Max `99_999_999_999` (BR-03). Get decimal places from `Intl.NumberFormat(...).resolvedOptions().maximumFractionDigits` (JPY 0, USD 2, KWD 3). Parse typed input by splitting on the decimal separator, never by multiplying floats. Round only for display (BR-11).
- **Transaction dates are local `YYYY-MM-DD` strings** and times are `"HH:mm"` (BR-06). Never store or compare them as `Date`/timestamps. Use date-fns.
- **Balance effects:** income: source `+amount`. Expense: source `−amount`. Transfer: source `−amount`, destination `+amount`. Balance = opening balance + the sum of effects. This logic lives only in pure functions in `core/domain/balance.ts` (`effects`, `editEffects`, §10).
- **Every transaction write is one `writeBatch`**: the transaction doc plus `currentBalance: increment(delta)` on each affected account (skip zero deltas). An edit reverses the old effects and applies the new ones in the same batch. Never set `currentBalance` directly.
- **Don't `await batch.commit()` in the UI.** Offline, it resolves only after the server confirms. Fire it, catch and report errors, and rely on the local cache for instant UI (NFR-03).
- **Transfers are excluded** from income, expense, category and budget totals (TXN-09). **Balance adjustments** (system category) are excluded from reports and budgets (BR-12).
- Always write `accountIds`: `[accountId]` or `[accountId, toAccountId]`. Write `source: 'web'` and set `createdAt`/`updatedAt` with `serverTimestamp()` on every write.
- **Periods:** month start day D (1–28) runs from day D to day D−1 of the next month, and the current period contains today (BR-05). When D ≠ 1, show the date range, not a month name.
- Budget state from % used: under 80 is on track, 80–99 is warning, 100 or more is over (BR-08). Budgets include subcategories of budgeted categories (BR-07). Savings rate = net ÷ income × 100, shown as "—" when income is 0 (BR-04).
- Field names, collection paths and lowercase enum values must match §8 **exactly**. Don't rename or add fields casually, because the Android app depends on them. Breaking schema changes bump `schemaVersion`. Weekdays are ISO: 1 = Monday … 7 = Sunday.
- Seed categories with the **fixed IDs** in Appendix A (`exp_food`, `inc_salary`, …) so re-seeding never duplicates them. System categories (`*_uncategorized`, `*_adjustment`) can't be deleted.

## Firebase and data access

- All user data lives under `users/{uid}/...` (§8). Use the **modular Firebase JS SDK** wrapped in injectable repository services in `core/data/*.repo.ts`. **Don't use AngularFire** (it lags Angular majors). Components and stores never import `firebase/*` directly.
- Firestore is initialized with `persistentLocalCache({ tabManager: persistentMultipleTabManager() })` and `ignoreUndefinedProperties: true`, and App Check uses reCAPTCHA Enterprise (§10). Config comes from `src/environments/environment.ts`.
- **Queries are always period-scoped:** `date >= start && date <= end`, `orderBy('date', 'desc')`. Filter by category, tag, amount and text on the device. All-time views page 50 at a time with `startAfter`. Never listen to a whole collection, because of the free-quota cost (NFR-19).
- Use `onSnapshot(..., { includeMetadataChanges: true })` and map `metadata.hasPendingWrites` to a `pending` flag for the unsynced marker (SYN-04). Sort within a day by `time`, then `createdAt`.
- Multi-document changes use batches or transactions (NFR-14). New composite indexes go in `firestore.indexes.json` (§8).
- **Never deploy test-mode Security Rules.** Rules follow §9 and need rules tests.

## Angular conventions (§10)

- Angular 22: standalone components (no NgModules), signals, `@if`/`@for`, **zoneless** (no zone.js, so don't add it), Signal Forms (typed reactive forms as the fallback).
- State: one signal-based store service per feature. Turn streams into signals with `toSignal()` and derive totals with `computed()`. Use NgRx SignalStore only if features end up sharing a lot of state.
- UI: Angular Material 3 + CDK (`BreakpointObserver`, virtual scroll for lists of 1,000+ rows, drag and drop, dialogs, bottom sheets). Material Symbols for icons.
- Routing: every feature is lazy-loaded (`loadComponent`/`loadChildren`). Every route except `/login`, `/register`, `/forgot-password` and `/onboarding` uses the functional `authGuard` + `onboardingGuard`. Route table is in §10.
- Components use SCSS. The current scaffold uses suffix-less component files (`app.ts`/`app.html`/`app.scss`); follow the spec's names for services, guards, repos and pipes (`auth.service.ts`, `auth.guard.ts`, `accounts.repo.ts`, `money.pipe.ts`).

Target layout:

```
src/app/
├── core/
│   ├── firebase/   firebase.ts: app, Auth, Firestore (persistent cache), App Check
│   ├── auth/       auth.service.ts, auth.guard.ts, onboarding.guard.ts
│   ├── data/       accounts / categories / transactions / budgets .repo.ts
│   ├── domain/     money, balance, period, budget, recurrence: pure TS, no Angular or Firebase imports
│   └── models/     interfaces mirroring §8
├── shared/         ui/ (amount-input, category-picker, account-picker, empty-state, confirm-dialog), pipes/
├── layout/         shell: side nav ≥1024px, rail 600–1023px, bottom bar + FAB <600px
└── features/       auth, onboarding, dashboard, transactions, accounts, categories, budgets, reports, recurring, settings
```

## UI, accessibility and privacy

- Mobile-first, usable from 320 px. Touch targets at least 48 px. WCAG 2.2 AA, including respecting reduced motion (NFR-05, NFR-08).
- Income and expense **never rely on color alone**: each also has a +/− sign and an icon. Every chart has a table alternative (NFR-09). Amounts are right-aligned with `font-variant-numeric: tabular-nums`.
- All UI text goes in translation files. Format numbers, currency and dates with `Intl` for the user's locale (NFR-17).
- Single deletes get a 5-second Undo. Confirmation dialogs are only for bulk or irreversible actions. Every empty state offers the next action. Dark mode works via theme tokens from day one.
- **No amounts, notes, payees or category names in logs, analytics or error reports** (NFR-13).

## Testing (§14)

- Domain logic in `core/domain/` is pure and needs at least 80% coverage, driven by the shared JSON test vectors that the Kotlin app also runs.
- Security Rules are tested with `@firebase/rules-unit-testing` on the Emulator. End-to-end tests use Playwright against the Emulator and cover user stories US-01 to US-09 (§5).
- The Firebase environments are the local Emulator (`firebase emulators:start`), `expense-tracker-dev` (deployed on merge to `main`) and `expense-tracker-prod` (deployed on tagged releases).

## Working with the spec

- Requirements have IDs (`TXN-06`, `BR-05`, `NFR-09`, `US-03`). Cite them in test names, commit messages and PRs.
- Priority: **Must** = MVP, **Should** = v1.1, **Could** = later. Don't build Should or Could items unless asked, because MVP scope is frozen at M1.
- Open decisions (§16): charts (ngx-echarts vs ng2-charts) and i18n (Transloco vs `@angular/localize`) aren't chosen yet, so **ask before adding either**. For the UI library and state management, use the spec's recommendations (Material 3, signal stores) as the defaults.
