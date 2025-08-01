import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'node16',
  sourcemap: true,
  external: [
        'better-sqlite3',
    ],
});