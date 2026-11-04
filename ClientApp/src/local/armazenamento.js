// Armazenamento do modo local: guarda o estado inteiro (um objeto JSON) no aparelho.
//
// Plano A: IndexedDB (robusto e com bastante espaço). Plano B: localStorage, para navegadores em que o
// IndexedDB está indisponível (alguns modos privados). Os dados de finanças pessoais são pequenos
// (milhares de lançamentos cabem em poucos MB), então gravar o estado inteiro a cada alteração é simples e seguro.
import { criarEstadoInicial, validarEstado, ErroLocal } from './engine.js';

const NOME_BD = 'controle-financeiro';
const LOJA = 'estado';
const CHAVE = 'principal';
const CHAVE_LS = 'controle-financeiro:estado';

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

async function lerIDB() {
  const bd = await abrirBanco();
  try {
    return await new Promise((resolve, reject) => {
      const r = bd.transaction(LOJA, 'readonly').objectStore(LOJA).get(CHAVE);
      r.onsuccess = () => resolve(r.result ?? null);
      r.onerror = () => reject(r.error);
    });
  } finally {
    bd.close();
  }
}

async function gravarIDB(estado) {
  const bd = await abrirBanco();
  try {
    await new Promise((resolve, reject) => {
      const t = bd.transaction(LOJA, 'readwrite');
      t.objectStore(LOJA).put(estado, CHAVE);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  } finally {
    bd.close();
  }
}

/** Lê o estado salvo; se não houver nada, cria o estado inicial (categorias e contas padrão). */
export async function carregarEstado() {
  let bruto = null;
  try { bruto = await lerIDB(); } catch { /* usa o plano B */ }
  if (!bruto) {
    try {
      const texto = localStorage.getItem(CHAVE_LS);
      if (texto) bruto = JSON.parse(texto);
    } catch { /* ignora */ }
  }

  if (!bruto) {
    const inicial = criarEstadoInicial();
    await salvarEstado(inicial);
    return inicial;
  }

  try {
    return validarEstado(bruto);
  } catch {
    throw new ErroLocal('Os dados salvos neste aparelho estão inconsistentes. Use "Importar backup" no menu para restaurá-los.', 500);
  }
}

export async function salvarEstado(estado) {
  try {
    await gravarIDB(estado);
    return;
  } catch { /* tenta o plano B */ }
  try {
    localStorage.setItem(CHAVE_LS, JSON.stringify(estado));
  } catch {
    throw new ErroLocal('Não foi possível salvar os dados neste aparelho (sem espaço ou armazenamento bloqueado).', 500);
  }
}

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
