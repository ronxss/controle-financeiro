// Backup automático no APK: uma cópia por semana em Documentos/Controle Financeiro, mantendo só as mais recentes.
// Módulo puro: os plugins chegam por parâmetro (testável no Node). Quem chama é servicosAparelho.js.
//
// IMPORTANTE: como o backup manual, o arquivo NÃO é criptografado. Por isso é opcional e vem desligado.
import { montarBackup, hojeISO, diasEntre } from './engine.js';
import { PASTA_DOCUMENTOS } from './exportarNativo.js';

export const INTERVALO_DIAS = 7;
export const MANTER = 4;
const PADRAO_NOME = /^backup-automatico-\d{4}-\d{2}-\d{2}\.json$/;

/** Precisa fazer o backup automático agora? */
export function backupAutomaticoDevido(estado, agora = new Date()) {
  const b = estado?.config?.backup;
  if (!b?.automatico || !(estado.lancamentos?.length > 0)) return false;
  if (!b.ultimoAutomatico) return true;
  return diasEntre(hojeISO(new Date(b.ultimoAutomatico)), hojeISO(agora)) >= INTERVALO_DIAS;
}

/**
 * Grava o backup e apaga os automáticos mais antigos (fica com `MANTER`). Devolve o caminho mostrado à pessoa.
 * Não mexe em backups feitos à mão (só nos que seguem o padrão de nome do automático).
 */
export async function gravarBackupAutomatico(estado, { Filesystem, Directory, Encoding }, agora = new Date()) {
  const nome = `backup-automatico-${hojeISO(agora)}.json`;
  await Filesystem.writeFile({
    path: `${PASTA_DOCUMENTOS}/${nome}`, data: montarBackup(estado, agora.toISOString()),
    directory: Directory.Documents, encoding: Encoding.UTF8, recursive: true,
  });

  try {
    const { files = [] } = await Filesystem.readdir({ path: PASTA_DOCUMENTOS, directory: Directory.Documents });
    const automaticos = files
      .map((f) => (typeof f === 'string' ? f : f.name))
      .filter((n) => PADRAO_NOME.test(n))
      .sort(); // o nome tem a data: ordem alfabética = ordem cronológica
    for (const velho of automaticos.slice(0, Math.max(0, automaticos.length - MANTER))) {
      await Filesystem.deleteFile({ path: `${PASTA_DOCUMENTOS}/${velho}`, directory: Directory.Documents });
    }
  } catch {
    // não conseguir limpar os antigos não invalida o backup novo
  }
  return `Documentos/${PASTA_DOCUMENTOS}/${nome}`;
}
