import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import pwa from './pwa-plugin.js';

// Dois jeitos de compilar o mesmo front-end:
//
// - Normal (`npm run build`): vai para ../wwwroot, servido pelo ASP.NET Core (sistema monolítico, com login e SQL Server).
//   `npm run dev` abre o Vite com hot reload e encaminha /api para o backend em http://localhost:5080.
//
// - Mobile (`npm run build:mobile`): modo local, sem servidor. Vai para dist-local, com caminhos relativos
//   (base './') para funcionar em qualquer endereço (GitHub Pages, dentro do app Android) e com service worker
//   para abrir offline. As variáveis desse modo estão em .env.mobile.
export default defineConfig(({ mode }) => {
  const mobile = mode === 'mobile';
  return {
    plugins: [react(), ...(mobile ? [pwa()] : [])],
    base: mobile ? './' : '/',
    build: { outDir: mobile ? 'dist-local' : '../wwwroot', emptyOutDir: true },
    server: {
      port: 5173,
      proxy: { '/api': { target: 'http://localhost:5080', changeOrigin: true } },
    },
  };
});
