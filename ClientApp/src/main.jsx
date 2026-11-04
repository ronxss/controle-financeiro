import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import '@fontsource/roboto/300.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';
import App from './App.jsx';
import { MODO_LOCAL } from './modo.js';

// O modo local roda em hospedagem estática (GitHub Pages) e dentro do app Android. Não existe servidor para
// responder a caminhos como /lancamentos, então as rotas ficam depois do "#" (HashRouter).
const Roteador = MODO_LOCAL ? HashRouter : BrowserRouter;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Roteador>
      <App />
    </Roteador>
  </React.StrictMode>
);

// Service worker: faz o app abrir e funcionar sem internet. Só no modo local, e não dentro do app Android,
// que já carrega os arquivos de dentro do próprio aplicativo.
if (MODO_LOCAL && 'serviceWorker' in navigator && !window.Capacitor?.isNativePlatform?.()) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* sem offline, o app segue funcionando online */ });
  });
}
