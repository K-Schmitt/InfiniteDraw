import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  base: process.env['VITE_BASE_PATH'] ?? '/',
  plugins: [tsconfigPaths()],
  server: {
    port: 5173,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
      },
    },
  },
  build: {
    target: 'baseline-widely-available',
    outDir: 'dist',
  },
});
