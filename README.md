# Expensify web

A personal income, expense and transfer tracker: an Angular 22 progressive web app on Firebase. The spec is [docs/requirements.md](docs/requirements.md); a native Android app will share the same Firestore data later.

## Getting started

1. Install Node.js 24 and run `npm install`.
2. Connect a Firebase project: follow [docs/firebase.md](docs/firebase.md). It walks through creating the project, turning on sign-in, filling in `src/environments/` and deploying the Security Rules.
3. `npm start` and open <http://localhost:4200>.

## Commands

| Command                  | What it does                                                           |
| ------------------------ | ---------------------------------------------------------------------- |
| `npm start`              | Dev server with `environment.development.ts`                           |
| `npm run build`          | Production build with `environment.ts` into `dist/`                    |
| `npm test`               | Unit tests (Vitest); `npx ng test --watch=false` for a single run      |
| `npm run test:rules`     | Security Rules tests on the Firestore emulator (needs Java 11+)        |
| `npm run emulators`      | Start the Firebase Emulator Suite                                      |
| `npm run deploy:rules`   | Deploy `firestore.rules` and `firestore.indexes.json`                  |
| `npm run deploy:storage` | Deploy `storage.rules`, once Cloud Storage is set up (Blaze plan)      |
| `npm run deploy`         | Build and deploy hosting, rules and indexes to the selected project    |
| `npx prettier --check .` | Formatting                                                             |

## Layout

- `src/app/core/` — Firebase setup, auth and guards, repositories, pure domain logic, models
- `src/app/features/` — one folder per screen group (auth, onboarding, dashboard, transactions, …, settings)
- `src/app/layout/` — the shell, breakpoints, theme
- `src/app/shared/` — Lumen UI, the in-house component library, plus app composites, pipes and styles
- `firestore.rules`, `firestore.indexes.json`, `storage.rules`, `firebase.json` — the Firebase project files, tested in `firebase/`
