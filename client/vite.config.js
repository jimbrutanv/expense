import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// During `npm run client:dev` the API is proxied to the Express server on :4000.
// In production the Express server serves the built files from client/dist.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
