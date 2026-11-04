// Backup manual dos dados do modo local.
//
// Os dados ficam SÓ no aparelho. Se o celular for perdido, formatado, ou o app/navegador for desinstalado
// ou tiver os dados limpos, tudo se perde, a não ser que exista um backup. Por isso o menu oferece
// "Exportar backup" e "Importar backup".
import { montarBackup, lerBackup, hojeISO } from './engine.js';
import { lerEstadoAtual, substituirEstado } from './localApi.js';
import { Capacitor } from '@capacitor/core';
import { exportarNoAparelho } from './exportarNativo.js';

function baixar(arquivo) {
  const url = URL.createObjectURL(arquivo);
  const a = document.createElement('a');
  a.href = url;
  a.download = arquivo.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Gera o arquivo de backup. Devolve { resultado, salvoEm }:
 * - APK (Android): cópia em Documentos/Controle Financeiro + folha de compartilhamento ('salvo', 'compartilhado' ou
 *   'cancelado'); `salvoEm` diz onde a cópia ficou.
 * - Navegador de celular: folha de compartilhamento ('compartilhado' ou 'cancelado').
 * - Computador: baixa o arquivo ('baixado').
 */
export async function exportarBackup() {
  const estado = await lerEstadoAtual();
  const nome = `controle-financeiro-backup-${hojeISO()}.json`;
  const texto = montarBackup(estado);

  if (Capacitor.isNativePlatform()) {
    // Carregados só no app nativo: o PWA não precisa deles.
    const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
      import('@capacitor/filesystem'), import('@capacitor/share'),
    ]);
    const r = await exportarNoAparelho(nome, texto, { Filesystem, Directory, Encoding, Share });
    if (r.compartilhado) return { resultado: 'compartilhado', salvoEm: r.salvoEm };
    if (r.salvoEm) return { resultado: 'salvo', salvoEm: r.salvoEm };
    return { resultado: 'cancelado', salvoEm: null };
  }

  const arquivo = new File([texto], nome, { type: 'application/json' });
  if (navigator.canShare?.({ files: [arquivo] })) {
    try {
      await navigator.share({ files: [arquivo], title: 'Backup do Controle Financeiro' });
      return { resultado: 'compartilhado', salvoEm: null };
    } catch (e) {
      if (e?.name === 'AbortError') return { resultado: 'cancelado', salvoEm: null }; // fechou a folha
      // qualquer outro erro: tenta baixar o arquivo
    }
  }
  baixar(arquivo);
  return { resultado: 'baixado', salvoEm: null };
}

/** Valida o texto do backup (lança ErroLocal se estiver errado) sem alterar nada. Útil antes de pedir confirmação. */
export function conferirBackup(texto) {
  lerBackup(texto);
}

/** Substitui TODOS os dados do aparelho pelo conteúdo do backup. */
export async function importarBackup(texto) {
  await substituirEstado(lerBackup(texto));
}
