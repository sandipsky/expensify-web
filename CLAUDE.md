# CLAUDE.md

Personal income/expense/transfer tracker. This repo is the **Angular web app (phase 1)**, a responsive PWA on Firebase. A native Kotlin Android app (phase 2) will read and write the **same Firestore data**, so the data model and business rules are a cross-platform contract.

**The spec is `docs/requirements.md`.** Read the relevant section before implementing a feature. Section refs below (§N) point into it.

## Current state

Angular 22 CLI scaffold: `src/app/app.html` is still the CLI placeholder page and `app.routes.ts` is empty. **Lumen UI**, the in-house component library, is already in `src/app/shared/` (see the Lumen UI section) but no page uses it yet, and its icon folder `public/svg/` is empty. Not yet installed: Firebase JS SDK, `@angular/pwa`, ESLint (angular-eslint), Playwright, Firebase Emulator Suite, i18n. **Angular Material and the CDK are not used**: Material 3 is the Android app's toolkit, and the web UI is Lumen. Next milestone is **M0 Setup** (§15).

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

## Git

Work on `main` only. Commit to `main` and push `origin main`; don't create feature branches or pull requests unless asked for one.

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
- The profile `users/{uid}` goes through `UsersRepo`; `core/preferences.ts` (`Preferences`) exposes its fields as signals with defaults, and `save()` writes only the fields passed, with a merging set (per-field last write wins, SYN-03). Never write the profile from a feature directly.
- Notifications (§3.13) are raised on the device until FCM and the Functions exist: `features/notifications/notifier.ts` shows a toast, or a system notification while the tab is hidden and permission is granted, and records it in the device-local alert list (`AlertInbox`, NTF-05). Each alert source checks its `notificationPrefs` switch first (NTF-04). The alert list and "already reminded" state live in localStorage (`device-state.ts`), not Firestore.
- Recurring occurrences (§3.9) are written by `RecurringRepo` in one transaction (`LocalDb.runTransaction`, later Firestore's) under the fixed ID `{ruleId}_{YYYYMMDD}`, so they're exactly-once (REC-05). `RecurringRunner` does it on the device until the generateRecurring Function exists; keep the schedule rules in `core/domain/recurrence.ts` in step with §8.
- **Never deploy test-mode Security Rules.** Rules follow §9 and need rules tests.
- **Access control (§3.16, §9):** every profile has `role` (`user` · `admin`) and `status` (`pending` · `active` · `disabled`). The client creates its own profile as `user`/`pending` (or `active` when `invites/{email}` exists) and never sets its own role or status afterwards. Rules deny everything under `users/{uid}/*` unless status is `active`; admins may list profiles and change only `role` and `status` on other users, never subcollections. Account deletion deletes the profile document last.

## Angular conventions (§10)

- Angular 22: standalone components (no NgModules), signals, `@if`/`@for`, **zoneless** (no zone.js, so don't add it).
- Forms: **typed reactive forms** (`FormBuilder.nonNullable`), never Signal Forms. Lumen inputs are `ControlValueAccessor`s and their inline validation reads `NgControl`, which Signal Forms does not provide.
- State: one signal-based store service per feature. Turn streams into signals with `toSignal()` and derive totals with `computed()`. Use NgRx SignalStore only if features end up sharing a lot of state.
- UI: **Lumen UI** from `src/app/shared/components/ui/` (next section). No Angular Material, no CDK, no other component library.
- Routing: every feature is lazy-loaded (`loadComponent`/`loadChildren`). Every route except `/login`, `/register`, `/forgot-password` and `/no-access` uses the functional `authGuard` (signed in **and** `status: 'active'`, otherwise redirect to `/no-access`); all of those except `/onboarding` add `onboardingGuard`, and `/admin/*` adds `adminGuard`. Route table is in §10.
- Components use SCSS. The current scaffold uses suffix-less component files (`app.ts`/`app.html`/`app.scss`); Lumen follows the same convention. Follow the spec's names for services, guards, repos and pipes (`auth.service.ts`, `auth.guard.ts`, `accounts.repo.ts`, `money.pipe.ts`).

Target layout:

```
src/app/
├── core/
│   ├── firebase/   firebase.ts: app, Auth, Firestore (persistent cache), App Check
│   ├── auth/       auth.service.ts, auth.guard.ts, admin.guard.ts, onboarding.guard.ts
│   ├── data/       accounts / categories / transactions / budgets / users .repo.ts
│   ├── domain/     money, balance, period, budget, recurrence: pure TS, no Angular or Firebase imports
│   └── models/     interfaces mirroring §8
├── shared/
│   ├── components/ui/   Lumen UI: generic l-* components, overlay services, layout primitives
│   ├── components/      app composites built on Lumen: amount-input, category-picker, account-picker, empty-state
│   ├── directives/      form-validation.ts (Lumen)
│   ├── services/        spinner.service.ts (Lumen)
│   ├── files/           download.ts (saveFile, objectUrl), zip.ts, xlsx.ts, compress-image.ts: no spreadsheet, PDF or image library
│   ├── styles/          _fonts.scss, _colors.scss (tokens), _form.scss, _utils.scss; forwarded by src/styles.scss
│   └── pipes/           money.pipe.ts, …
├── layout/         shell: side nav ≥1024px, rail 600–1023px, bottom bar + FAB <600px; breakpoint.service.ts
└── features/       auth, onboarding, dashboard, transactions, accounts, categories, budgets, reports, recurring, settings, admin
```

## Lumen UI (`src/app/shared`)

Lumen is our own component library, checked into this repo: standalone, `OnPush`, signal `input()`/`output()`/`model()`, and no dependency beyond `@angular/core`, `forms`, `common`, `router` and `rxjs`. Selectors use the `l-` prefix (`l-button`), attribute directives `l` (`lTooltip`, `lBadge`, `lTableCell`), CSS classes `l-`/`lui-`. Import from the folder's `index.ts` barrel when it has one (most folders do), otherwise from the component file (`button/button`, `card/card`, `icon/icon`, `avatar/avatar`, `loading-spinner/loading-spinner`, and every `input/*` except `otp-input`). There is no tsconfig path alias, so imports are relative.

**Which component for what:**

| Need                                                               | Use                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Buttons, icon buttons                                              | `l-button` (`variant`: primary · secondary · outlined · outlined-primary · danger · ghost; `size` sm/md/lg; `width="full"`; `rounded` for icon-only)                                                                                  |
| Cards, dashboard tiles, list sections                              | `l-card` (`title`, `[card-extra]` slot top-right, `[card-footer]`, `hoverable` for clickable cards, `padding`, `shadow`)                                                                                                              |
| Period switcher, expense/income/transfer toggle                    | `l-segmented-control` (form-bound; options as strings or `{ label, value }`)                                                                                                                                                          |
| Expense/income tabs (categories, reports)                          | `l-tabs` + `l-tab` (`[(value)]`, `variant` line/pills)                                                                                                                                                                                |
| Filter chips, tags, budget state labels                            | `l-chip` (`variant`: default · primary · success · error · warn · info · premium; `removable`) and `l-filter` (`filterColumns`, `(filterChange)`)                                                                                     |
| Desktop transaction table (≥1024 px)                               | `l-table [columns] [data] [(sort)] (rowClick)`; cells via `<ng-template lTableCell="amount" let-row>`; `groupBy` + `lTableGroup` day headers, `virtualScroll`, `rowSelected`                                                          |
| Text fields                                                        | `l-text-input`, `l-textarea`, `l-email-input`, `l-password-input` (`showRules`), `l-username-input`                                                                                                                                   |
| Numbers that are not money (month start day, counts)               | `l-number-input` (`decimalPlaces`, `prefix`/`suffix`; form value is a JS `number`)                                                                                                                                                    |
| Dropdowns and pickers                                              | `l-select` (`items`, `bindValue`, `bindLabel`, `groupBy`, `searchable`, `multiple`, `virtualScroll`, `clearable`)                                                                                                                     |
| Dates                                                              | `l-date-input` (see the value-type rule below)                                                                                                                                                                                        |
| Booleans and choices                                               | `l-checkbox`, `l-toggle`, `l-radio` (`options: RadioOption[]`)                                                                                                                                                                        |
| Receipt upload (v1.1)                                              | `l-file-upload` (`accept`, `maxSizeMb`, `[(files)]`; `[listFiles]="false"` hands picks to `(added)` for your own list, `buttonLabel`)                                                                                                 |
| Dialogs, forms on tablet and desktop                               | `ModalService.open(component or template, { data, width, disableClose, fullscreen })` returns `ModalRef` (`close(result)`, `afterClosed()`); read data with `inject(MODAL_DATA)`                                                      |
| Confirmations (bulk or irreversible only)                          | `ConfirmDialog` through `ModalService` with `ConfirmDialogData` (`confirmVariant: 'danger'`, optional async `onConfirm`)                                                                                                              |
| Phone bottom sheets, side panels                                   | `DrawerService.open(..., { position: 'bottom' or 'right', size })` returns `DrawerRef`; data via `DRAWER_DATA`                                                                                                                        |
| Toasts                                                             | `NotificationService.success/error/warn/info(title, message?, options)` (`duration`, `position`)                                                                                                                                      |
| Row and overflow menus ("More")                                    | `l-menu` with a `[dropdown-display]` trigger and `[dropdown-item]` or `[dropdown-content]` panel content                                                                                                                              |
| Onboarding wizard                                                  | `l-stepper` (`steps`, `[(active)]`)                                                                                                                                                                                                   |
| First-load placeholders                                            | `l-skeleton` (sized block, or wrap content and toggle `[visible]="loading()"`)                                                                                                                                                        |
| Blocking wait (import, delete account)                             | one `<l-loading-spinner />` in the shell plus `SpinnerService.show()/hide()` (reference-counted); never for page loads                                                                                                                |
| Charts (reports, dashboard)                                        | `l-bar-chart` (`groups`, `series`, `format`, `tickFormat`, `selected`, `clickable`, `tableToggle`, `(groupClick)`) and `l-donut-chart` (`segments`, `legend`, `(segmentClick)`, centre slot); both have a table view (NFR-09)         |
| Tooltips, badges, avatars, pagination, breadcrumb, accordion, tree | `[lTooltip]`, `l-badge` or `[lBadge]`, `l-avatar`, `l-pagination`, `l-breadcrumb`, `l-accordion`, `l-tree`                                                                                                                            |
| Layout                                                             | `l-row`/`l-col` (12 columns, `gutter`, `span`, `xs…xxl` at 0/576/768/992/1200/1400 px), `l-flex`, `l-box`, `l-spacer`; utility classes from `_utils.scss` (`d-flex`, `gap-md`, `mt-lg`, `text-end`, `font-semibold`, `text-ellipsis`) |

**Rules that follow from how Lumen is built:**

- **Money never goes through `l-number-input`**: its form value is a float. Build `shared/components/amount-input` on `l-text-input` (or a native `<input inputmode="decimal" class="form-control">` inside `.form-group`) that parses to integer minor units (BR-01).
- **`l-date-input` writes a `Date`** to the form control (it accepts `Date | string`). Convert at the form boundary with date-fns (`format(d, 'yyyy-MM-dd')`, `parseISO`) and store only the string (BR-06). Keep `calendar="ad"`; the BS (Nepali) calendar exists but isn't a spec feature. Its weeks start on `weekStart`, else on `L_WEEK_START`, which the app provides from `Preferences.weekStartDay` (SET-05).
- Every `l-*` input carries the `FormValidation` host directive: it adds the required `*` and shows an error once the control is touched or dirty. Its messages are English literals in `shared/directives/form-validation.ts`; route them through the i18n solution once chosen (NFR-17). `useValidation="false"` opts a field out.
- `l-button` renders `<button type="button">`, so it never submits a form. Call the save method from `(click)` and handle Enter with the input's `(enter)` output.
- For an irreversible action such as deleting the account, `ConfirmDialogData.confirmPhrase` (e.g. `'DELETE'`) keeps the confirm button off until the user types it.
- The toast has no action button. The 5-second Undo (TXN-07) needs an `action: { label, handler }` option on `NotificationOptions`; add it to Lumen's notification instead of building a second toast.
- No `BreakpointObserver`. The shell's 600/1024 px breakpoints (§10) come from a small signal-based `BreakpointService` on `window.matchMedia` in `layout/`. `GridBreakpoints` in `layout/grid.ts` uses Bootstrap's widths and only drives `l-col`.
- Long lists (NFR-04, LST-04) use Lumen's own windowing, never the CDK: `l-virtual-list [items] [itemSize] [trackBy] (endReached)` with an `<ng-template lVirtualItem let-item>`, and `l-table [virtualScroll]="true" [rowHeight]` (plus `groupBy` and an `lTableGroup` template for day headers). Both scroll with the shell's `<main>` and need **fixed item heights**: keep rows to one or two ellipsized lines at exactly the height you pass. `l-select` has its own `virtualScroll`.
- **Icons:** `<l-icon name="…" [size]="20" color="var(--error)" />` fetches `public/svg/<name>.svg`, rebinds its colors to `currentColor` and caches it; an unknown name warns in dev and renders nothing. `public/svg/` is empty and `ICON_NAMES` in `icon/icon.ts` still lists another app's icons, so before the first screen: add the SVGs this app needs, replace `ICON_NAMES`, prune the leftovers. Category and account `icon` values in Firestore are **Material Symbols names** (§8, Appendix A) so Android can draw them from the font; on web ship those symbols as SVG files named exactly after the Material Symbols name and draw them with `l-icon`. Don't add the Material Symbols web font or another icon library without asking (NFR-01, NFR-02, offline shell).
- Overlays stack: modal and drawer containers register in `components/ui/overlay-stack.ts`, so Escape closes only the top one (a receipt viewer over its transaction form). A new overlay kind registers too.
- Printing: `shared/styles/_print.scss` hides the shell and lets `<main>` flow across pages; mark screen-only controls `.no-print`. The monthly report is saved as PDF from the print dialog (DAT-05), so there is no PDF library.
- Touch targets: the default `md` button is about 32 px tall. On phones give tappable controls `size="lg"` or a 48 px min-height (NFR-05).
- Lumen is our code. Fix or extend a component in place (keep the `l-` prefix, signal inputs, `OnPush`, tokens only, no new dependencies) and add a spec for the change. Don't copy a component into a feature folder, and don't put app-specific composites (amount-input, category-picker, account-picker, empty-state) inside `components/ui/`; they live in `shared/components/`.

**Styling and tokens** (`shared/styles/`, forwarded by `src/styles.scss`):

- `_colors.scss` defines the CSS custom properties on `:root`: `--accent`, `--accent-bg`, `--accent-dark` (blue: primary actions, focus rings), `--success`/`--success-bg`, `--error`/`--error-bg`, `--warn`/`--warn-bg`, `--info`/`--info-bg`, `--premium`/`--premium-bg`, `--text-primary` … `--text-quaternary`, `--text-white`, `--separator`, `--separator-light`, `--separator-dark`, `--bg-lightest`, `--bg-light`, `--bg-semi-light`, `--bg-dark`. Component SCSS uses `var(--…)`, never hex literals. App meaning: income → `--success`, expense → `--error`, transfer → neutral text color, budget states → success/warn/error (BR-08).
- **Dark mode** (§8 `theme`, SET-06): every token has a dark value in `_colors.scss` (`@mixin dark-tokens`, applied under `:root[data-theme='dark']` and under `prefers-color-scheme: dark` unless `data-theme='light'`, screen only so print stays light). Never add per-component dark overrides. `ThemeService` (`layout/theme.ts`) sets `data-theme` from the preference, and `index.html` applies the saved theme before first paint. Extra tokens: `--accent-text` (accent as text, AA in both themes; `--accent` is for fills, borders, focus rings and icons), `--accent-hover` (hover fill under white text), `--bg-raised` (selected segment surface), `--data-color-lift` (mix a user-picked hex toward `--text-white` by this much in dark mode, as `symbol-icon` does).
- `_form.scss` provides `.form-group`, `.form-control`, `.alert` and `.control-row`; any native input you add (amount-input) uses these classes so it matches the library. `_utils.scss` has the spacing and text utilities; prefer them over one-off margins.
- `body` is Fira Sans 14 px, self-hosted (the shell must work offline, NFR-06): `_fonts.scss` declares `@font-face` for weights 400/500/600/700 (Latin and Latin Extended, no italics) from `public/fonts/fira-sans/`. Add the woff2 file and the weight there before using another weight. Never load fonts from a CDN. Form controls inherit the family from `styles.scss`, so components should not set their own `font-family`.

## UI, accessibility and privacy

- Mobile-first, usable from 320 px. Touch targets at least 48 px. WCAG 2.2 AA, including respecting reduced motion (NFR-05, NFR-08).
- Income and expense **never rely on color alone**: each also has a +/− sign and an icon. Every chart has a table alternative (NFR-09). Amounts are right-aligned with `font-variant-numeric: tabular-nums`.
- All UI text goes in translation files. Format numbers, currency and dates with `Intl` for the user's locale (NFR-17).
- Single deletes get a 5-second Undo. Confirmation dialogs (`ConfirmDialog`) are only for bulk or irreversible actions. Every empty state offers the next action. Dark mode works via theme tokens from day one.
- **No amounts, notes, payees or category names in logs, analytics or error reports** (NFR-13).

## Testing (§14)

- Domain logic in `core/domain/` is pure and needs at least 80% coverage, driven by the shared JSON test vectors that the Kotlin app also runs.
- Security Rules are tested with `@firebase/rules-unit-testing` on the Emulator. End-to-end tests use Playwright against the Emulator and cover user stories US-01 to US-10 (§5).
- The Firebase environments are the local Emulator (`firebase emulators:start`), `expense-tracker-dev` (deployed on merge to `main`) and `expense-tracker-prod` (deployed on tagged releases).

## Working with the spec

- Requirements have IDs (`TXN-06`, `BR-05`, `NFR-09`, `US-03`). Cite them in test names, commit messages and PRs.
- Priority: **Must** = MVP, **Should** = v1.1, **Could** = later. Don't build Should or Could items unless asked, because MVP scope is frozen at M1.
- Open decisions (§16): i18n (Transloco vs `@angular/localize`) isn't chosen yet, so **ask before adding it**. Charts are decided: Lumen's own `l-bar-chart` and `l-donut-chart` (`shared/components/ui/chart/`), no chart library. Material 3 in the spec is the Android app's toolkit (§11); the web app uses Lumen UI and shares only Android's color values and Material Symbols icon names. State management follows the spec (signal stores).
