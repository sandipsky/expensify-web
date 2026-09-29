# Connecting the app to Firebase

This guide takes you from "I have the code" to "I can sign in and see my dashboard". It takes about 20 minutes. You don't need to have used Firebase before.

The app keeps every user's data in **Cloud Firestore** and signs people in with **Firebase Authentication** (email and password, or Google). The app's own copy of the settings that point it at your Firebase project lives in two files:

| File                                          | Used by         | Put in it                                                       |
| --------------------------------------------- | --------------- | --------------------------------------------------------------- |
| `src/environments/environment.development.ts` | `npm start`     | Your **dev** project (or the emulators)                         |
| `src/environments/environment.ts`             | `npm run build` | Your **production** project (the same project is fine at first) |

Both files look the same. Here is what you're filling in:

```ts
export const environment = {
  production: false,
  firebase: {
    apiKey: '', // ← from the Firebase console, step 4
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: '',
  },
  appCheck: {
    recaptchaSiteKey: '', // optional, step 8
    debug: true,
  },
  useEmulators: false, // optional, step 9
};
```

> **Is it safe to commit these values?** Yes. A web app's Firebase config is public by design: anyone can read it from the built app. What protects your data is the Security Rules (`firestore.rules`) and App Check, not secrecy. Just don't paste in anything from a _service account_ file; that one is a real secret and this app never needs it.

---

## Step 1: Create a Firebase project

1. Go to <https://console.firebase.google.com> and sign in with a Google account.
2. Click **Create a project** (or **Add project**).
3. Give it a name, for example `expense-tracker-dev`. Firebase turns it into a **project ID** like `expense-tracker-dev-1a2b3`. Note that ID; you'll need it twice.
4. When asked about Google Analytics, turn it **off**. The app doesn't use it.
5. Click **Create project** and wait for it to finish.

You're now looking at the project overview. The left-hand menu is where everything else happens.

## Step 2: Turn on the two sign-in methods

1. In the left menu open **Build → Authentication** and click **Get started**.
2. Open the **Sign-in method** tab.
3. Click **Email/Password**, switch **Enable** on, and save. (Leave "Email link" off.)
4. Click **Add new provider → Google**, switch **Enable** on, pick a support email, and save.

That's all the app needs. It never sends verification emails, so you don't need to set those up.

## Step 3: Create the Firestore database

1. In the left menu open **Build → Firestore Database** and click **Create database**.
2. Pick a location close to your users (for example `asia-south1` for South Asia, or `nam5 (us-central)`). This can't be changed later.
3. When asked about rules, choose **production mode**. Don't pick test mode: it leaves the whole database open to anyone for 30 days. The app ships its own rules, which you'll deploy in step 6.
4. Click **Create**.

## Step 4: Register the web app and copy its settings

1. Click the **gear icon** next to _Project Overview_ (top left) → **Project settings**.
2. Scroll down to **Your apps** and click the **web icon** `</>`.
3. Give the app a nickname (anything, for example `web`). You don't need Firebase Hosting ticked yet.
4. Click **Register app**. Firebase shows a block of code that looks like this:

   ```js
   const firebaseConfig = {
     apiKey: 'AIzaSyB1234567890abcdefghijklmnopqrstuv',
     authDomain: 'expense-tracker-dev-1a2b3.firebaseapp.com',
     projectId: 'expense-tracker-dev-1a2b3',
     storageBucket: 'expense-tracker-dev-1a2b3.firebasestorage.app',
     messagingSenderId: '123456789012',
     appId: '1:123456789012:web:abcdef1234567890abcdef',
   };
   ```

5. Keep this page open (you can always find it again under _Project settings → Your apps → SDK setup and configuration_).

## Step 5: Put the values into the app

Open `src/environments/environment.development.ts` in your editor and copy each value across. The names match one to one; only the quotes change from double to single:

| Firebase shows      | Goes into                    |
| ------------------- | ---------------------------- |
| `apiKey`            | `firebase.apiKey`            |
| `authDomain`        | `firebase.authDomain`        |
| `projectId`         | `firebase.projectId`         |
| `storageBucket`     | `firebase.storageBucket`     |
| `messagingSenderId` | `firebase.messagingSenderId` |
| `appId`             | `firebase.appId`             |

Filled in, the file looks like this:

```ts
export const environment = {
  production: false,
  firebase: {
    apiKey: 'AIzaSyB1234567890abcdefghijklmnopqrstuv',
    authDomain: 'expense-tracker-dev-1a2b3.firebaseapp.com',
    projectId: 'expense-tracker-dev-1a2b3',
    storageBucket: 'expense-tracker-dev-1a2b3.firebasestorage.app',
    messagingSenderId: '123456789012',
    appId: '1:123456789012:web:abcdef1234567890abcdef',
  },
  appCheck: {
    recaptchaSiteKey: '',
    debug: true,
  },
  useEmulators: false,
};
```

Do the same in `src/environments/environment.ts`. If you only have one Firebase project for now, put the same values in both files; when you create a separate production project later (step 10), only `environment.ts` changes.

Two things to watch for:

- Leave the field names exactly as they are. The app reads `apiKey`, not `apikey` or `API_KEY`.
- If a value is empty the app treats Firebase as "not set up" and says so on the sign-in page instead of failing quietly.

## Step 6: Deploy the Security Rules and indexes

The rules in `firestore.rules` are what stop one user from reading another user's money. Until they're deployed, a database created in production mode refuses everything, and the browser console shows `permission-denied`.

1. Install the Firebase command-line tool once (Node.js is already installed if you can run the app):

   ```bash
   npm install -g firebase-tools
   firebase login
   ```

   A browser window opens; sign in with the same Google account as the console.

2. Open `.firebaserc` in the repo root and replace `expense-tracker-dev` with **your** project ID from step 1 (the one with the random suffix). Leave the `prod` line for later.

3. Deploy the rules and the composite indexes:

   ```bash
   npm run deploy:rules
   ```

   This runs `firebase deploy --only firestore`. The storage rules have their own command, `npm run deploy:storage`, because it fails until Cloud Storage is set up on the project, and that needs the paid Blaze plan. Until then receipts stay on the device.

   Indexes take a minute or two to build. You can watch them under **Firestore Database → Indexes**.

**No command line?** You can also paste the contents of `firestore.rules` into **Firestore Database → Rules** in the console and click **Publish**. The indexes then get created on demand: the first time a query needs one, the browser console shows an error with a link that creates it in one click.

## Step 7: Start the app and sign up

1. Run the app:

   ```bash
   npm start
   ```

   and open <http://localhost:4200>. You should see the sign-in page with no warning banner. (If there's a yellow banner saying Firebase isn't set up, a value in `environment.development.ts` is still empty.)

2. Click **Create an account** and register, or use **Continue with Google**.

3. You go straight to the welcome steps (currency, first account, categories). Finish them and you're on the dashboard. There is no approval step: anyone who signs up can use the app at once, and each person only ever sees their own data.

## Step 8 (optional but recommended before going public): App Check

App Check makes Firebase reject requests that don't come from your website, which stops someone using your project's public config from their own script.

1. In the console open **Build → App Check**, pick your web app, and choose **reCAPTCHA Enterprise**.
2. Follow the link to create a reCAPTCHA Enterprise key in Google Cloud for your domain(s). Add `localhost` too while you develop.
3. Copy the **site key** into `appCheck.recaptchaSiteKey` in both environment files.
4. Leave `appCheck.debug: true` in `environment.development.ts`. On `localhost` the app then prints a **debug token** in the browser console the first time it starts. Copy it, and in the console under **App Check → Apps → your app → ⋮ → Manage debug tokens**, add it. Without this, local development fails once you turn enforcement on.
5. Only when both work, click **Enforce** for Firestore and Authentication in the App Check page.

Leaving `recaptchaSiteKey` empty skips App Check altogether, which is fine while you're only testing.

## Step 9 (optional): Run everything locally with the emulators

The Firebase Emulator Suite runs Authentication and Firestore on your own machine: no internet, no quota, and you can wipe the data any time. It needs Java 11 or newer installed.

1. Start the emulators:

   ```bash
   npm run emulators
   ```

   The emulator UI opens at <http://localhost:4000>.

2. In `environment.development.ts` set `useEmulators: true` and `projectId: 'demo-expensify'` (the emulators accept any project ID that starts with `demo-`, and that one is what the scripts use). The other fields can stay as they are.

3. Run `npm start` as usual. Sign-ups now go to the emulator, and you can see and wipe the data in the emulator UI's Firestore tab.

The Security Rules tests run on the emulator too, without you starting it:

```bash
npm run test:rules
```

## Step 10 (later): A separate production project

The spec has two projects, `expense-tracker-dev` for every merge and `expense-tracker-prod` for tagged releases. When you're ready:

1. Repeat steps 1 to 4 for the production project.
2. Put its values into `src/environments/environment.ts` only.
3. In `.firebaserc`, set the `prod` alias to the production project ID.
4. Deploy rules to it with `firebase use prod && npm run deploy:rules`, then switch back with `firebase use dev`.
5. Build and host the site: `npm run deploy` builds the app and deploys it to Firebase Hosting on whichever project is selected. The first time, run `firebase init hosting` and accept the defaults (`dist/expensify-web/browser` is already in `firebase.json`).
6. Under **Authentication → Settings → Authorized domains**, add the domain you host on. Google sign-in refuses domains that aren't listed.

## If something goes wrong

| What you see                                                                       | What it means                                                                                                                                                          |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Yellow banner "Firebase isn't set up yet" on the sign-in page                      | `apiKey` or `projectId` is empty in the environment file `npm start` uses (`environment.development.ts`).                                                              |
| "This sign-in method isn't turned on in the Firebase project yet"                  | Step 2: enable Email/Password or Google under Authentication → Sign-in method.                                                                                         |
| "This website isn't on the Firebase project's list of authorized domains yet"      | Authentication → Settings → Authorized domains: add the domain (localhost is there by default).                                                                        |
| "Your browser blocked the Google sign-in window"                                   | Allow pop-ups for the site, then try again.                                                                                                                            |
| Stuck on "Loading your account" for more than a few seconds                        | The app can't reach Firestore: you're offline, the rules aren't deployed (step 6), or the project ID is wrong.                                                         |
| "Couldn't save your change" toasts, and `permission-denied` in the browser console | The rules refused the request. Usually they were never deployed (step 6), or the rules in the project are older than `firestore.rules`. Re-run `npm run deploy:rules`. |
| An error in the console with a long link to "create index"                         | A query needs a composite index that isn't built yet. Click the link, or run `npm run deploy:rules` and wait a minute.                                                 |
