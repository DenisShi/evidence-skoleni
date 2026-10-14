import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The first Fastify boot on a cold file system can take a few seconds.
  test: { testTimeout: 15_000 },
});
