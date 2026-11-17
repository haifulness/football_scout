import { defineConfig } from 'vitest/config';

/** `npm run balance`: the headless balance harness (slow; not part of `npm test`). */
export default defineConfig({
  test: { include: ['tests/sim/**/*.sim.ts'], environment: 'node', testTimeout: 1_800_000 },
});
