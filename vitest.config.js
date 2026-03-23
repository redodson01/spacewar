import { defineConfig } from 'vitest/config';

const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.js'],
    // Node 25+ ships a built-in localStorage that lacks .clear() and shadows
    // jsdom's full implementation. Disable it so jsdom's localStorage is used.
    ...(nodeMajor >= 25 && {
      poolOptions: {
        forks: {
          execArgv: ['--no-experimental-webstorage'],
        },
      },
    }),
  },
});
