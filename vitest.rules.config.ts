import { defineConfig } from 'vitest/config';

/**
 * The Security Rules tests run in Node against the Firestore emulator, apart
 * from the Angular unit tests (`ng test`): `npm run test:rules` starts the
 * emulator, runs them and stops it.
 */
export default defineConfig({
  test: {
    include: ['firebase/**/*.spec.ts'],
    environment: 'node',
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
