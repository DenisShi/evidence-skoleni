import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    build: {
      rolldownOptions: {
        output: {
          // Libraries change less often than the app, so they get chunks of their own that stay
          // in the browser cache across deployments.
          codeSplitting: {
            groups: [
              {
                name: 'react',
                test: /node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/,
              },
              {
                name: 'antd',
                test: /node_modules[\\/](antd|@ant-design|@rc-component|rc-[^\\/]+)[\\/]/,
              },
            ],
          },
        },
      },
      // antd alone is above Vite's default 500 kB warning limit even when split.
      chunkSizeWarningLimit: 1000,
    },
    server: {
      proxy: {
        '/api': env.API_URL ?? 'http://localhost:3000',
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./test/setup.ts'],
      // antd + jsdom: the first render on a cold cache can take a few seconds.
      testTimeout: 20_000,
    },
  };
});
