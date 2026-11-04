// Plugin do Vite que gera o service worker (sw.js) do modo local.
//
// O service worker guarda TODOS os arquivos do app no aparelho na primeira visita, e depois serve tudo
// de lá: o app abre e funciona sem internet. Não usa nenhuma dependência extra.
import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** Lista os arquivos de uma pasta (recursivo), com caminhos relativos e separador "/". */
function listar(pasta, base = pasta) {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome);
    return statSync(caminho).isDirectory() ? listar(caminho, base) : [relative(base, caminho).split(sep).join('/')];
  });
}

export default function pwaPlugin() {
  let pastaPublica = '';

  return {
    name: 'controle-financeiro-pwa',
    apply: 'build',

    configResolved(config) {
      pastaPublica = config.publicDir;
    },

    generateBundle(_opcoes, bundle) {
      // Arquivos gerados pelo Vite (index.html, JS, CSS, fontes) + arquivos de public/ (manifest, ícones).
      // As fontes .woff (formato antigo) ficam de fora: todo navegador atual usa o .woff2, e isso pela metade o tamanho do download.
      const gerados = Object.keys(bundle).filter((f) => !f.endsWith('.map') && !f.endsWith('.woff'));
      const publicos = pastaPublica ? listar(pastaPublica) : [];
      const arquivos = ['./', ...new Set([...gerados, ...publicos])];

      const versao = Date.now().toString(36); // muda a cada build: força a atualização do cache

      const codigo = `// Gerado automaticamente por pwa-plugin.js. Não edite.
const CACHE = 'controle-financeiro-${versao}';
const ARQUIVOS = ${JSON.stringify(arquivos, null, 2)};

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ARQUIVOS.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n.startsWith('controle-financeiro-') && n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// Cache primeiro: tudo que é do app vem do aparelho. Se faltar algo e não houver internet,
// páginas abrem o index.html (o app inteiro roda dentro dele).
self.addEventListener('fetch', (evento) => {
  const pedido = evento.request;
  if (pedido.method !== 'GET') return;
  if (new URL(pedido.url).origin !== self.location.origin) return;

  evento.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const guardado = await cache.match(pedido, { ignoreSearch: true });
      if (guardado) return guardado;
      try {
        return await fetch(pedido);
      } catch (erro) {
        if (pedido.mode === 'navigate') {
          const inicio = await cache.match('./index.html');
          if (inicio) return inicio;
        }
        throw erro;
      }
    })
  );
});
`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: codigo });
    },
  };
}
