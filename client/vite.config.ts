import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

// Deployed at slackliniste.com/draw behind a Traefik/Caddy stripprefix
// middleware — the container serves from "/", but the browser needs
// asset URLs prefixed with /draw. The dev server stays at "/".
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/draw/' : '/',
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
}));
