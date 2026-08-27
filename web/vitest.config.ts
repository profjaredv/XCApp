import path from 'path';
import { defineConfig } from 'vitest/config';

// Deliberately separate from vite.config.ts rather than a `test` block
// inside it. Vitest 4 ships its own (rolldown-flavoured) config types, and
// under those the build config's object-form `manualChunks` no longer
// type-checks — so merging the two makes `tsc -b` fail on a build setting
// that is correct and working. Keeping them apart means the test runner
// cannot break the production build's typing, at the cost of restating one
// alias.
//
// Added alongside the pace-zone engine: that engine is pure arithmetic over
// a coach's own definitions, and this project's rule is that arithmetic
// gets its test written first. The web package had no runner at all until
// now, so every frontend calculation — VDOT paces, PR bucketing, split
// maths — had only ever been verified by reading it.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    // Everything under test here is pure functions; nothing needs a DOM.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
