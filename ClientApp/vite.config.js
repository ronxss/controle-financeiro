import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Build vai para ../wwwroot, servido pelo ASP.NET Core (sistema monolítico).
// `npm run dev` abre o Vite com hot reload e encaminha /api para o backend em http://localhost:5080.
export default defineConfig({
  plugins: [react()],
  build: { outDir: '../wwwroot', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:5080', changeOrigin: true } },
  },
});
