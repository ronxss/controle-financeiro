// Armazenamento do modo local: guarda valores JSON (já cifrados, no caso dos dados dos usuários) no aparelho.
//
// Plano A: IndexedDB (robusto e com bastante espaço). Plano B: localStorage, para navegadores em que o
// IndexedDB está indisponível (alguns modos privados). Os dados de finanças pessoais são pequenos
// (milhares de lançamentos cabem em poucos MB), então gravar o valor inteiro a cada alteração é simples e seguro.
//
// Interface (a mesma que usuarios.js espera): ler, gravar, gravarVarios (atômico no IndexedDB), apagar.

const NOME_BD = 'controle-financeiro';
const LOJA = 'estado';
const PREFIXO_LS = 'controle-financeiro:';
// A versão anterior do app guardava o estado em "principal" (IndexedDB) e "controle-financeiro:estado" (localStorage).
const nomeLS = (chave) => (chave === 'principal' ? `${PREFIXO_LS}estado` : `${PREFIXO_LS}${chave}`);

function abrirBanco() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB indisponível.'));
    const req = indexedDB.open(NOME_BD, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(LOJA); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Banco de dados bloqueado.'));
  });
}

/** Executa `corpo(loja)` em uma transação e espera ela terminar (ou falhar). */
async function transacao(modo, corpo) {
  const bd = await abrirBanco();
  try {
    return await new Promise((resolve, reject) => {
      const t = bd.transaction(LOJA, modo);
      let resultado;
      const r = corpo(t.objectStore(LOJA));
      if (r) r.onsuccess = () => { resultado = r.result; };
      t.oncomplete = () => resolve(resultado);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  } finally {
    bd.close();
  }
}

const lerLS = (chave) => {
  try {
    const texto = localStorage.getItem(nomeLS(chave));
    return texto ? JSON.parse(texto) : null;
  } catch {
    return null;
  }
};

export const repo = {
  async ler(chave) {
    // O localStorage só recebe dados quando o IndexedDB falha, e é limpo quando o IndexedDB volta a gravar.
    // Logo, se existir algo lá, é a versão mais nova.
    const doLS = lerLS(chave);
    if (doLS !== null) return doLS;
    try {
      return (await transacao('readonly', (loja) => loja.get(chave))) ?? null;
    } catch {
      return null;
    }
  },

  async gravar(chave, valor) {
    return this.gravarVarios([[chave, valor]]);
  },

  /** Grava vários pares em uma única transação: ou todos entram, ou nenhum. */
  async gravarVarios(pares) {
    try {
      await transacao('readwrite', (loja) => { for (const [k, v] of pares) loja.put(v, k); });
      for (const [k] of pares) { try { localStorage.removeItem(nomeLS(k)); } catch { /* ignora */ } }
      return;
    } catch { /* tenta o plano B */ }
    try {
      for (const [k, v] of pares) localStorage.setItem(nomeLS(k), JSON.stringify(v));
    } catch {
      throw new Error('Não foi possível salvar os dados neste aparelho (sem espaço ou armazenamento bloqueado).');
    }
  },

  async apagar(chave) {
    try { localStorage.removeItem(nomeLS(chave)); } catch { /* ignora */ }
    try { await transacao('readwrite', (loja) => { loja.delete(chave); }); } catch { /* sem IndexedDB: nada a apagar */ }
  },
};

/**
 * Pede ao navegador para NÃO apagar os dados do app sozinho quando faltar espaço.
 * Importante no iPhone/iPad, onde o Safari pode limpar dados de sites. Instalar o app na tela inicial também ajuda.
 */
export async function solicitarPersistencia() {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
