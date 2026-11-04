// Backup manual dos dados do modo local.
//
// Os dados ficam SÓ no aparelho. Se o celular for perdido, formatado, ou o app/navegador for desinstalado
// ou tiver os dados limpos, tudo se perde, a não ser que exista um backup. Por isso o menu oferece
// "Exportar backup" e "Importar backup".
import { montarBackup, lerBackup, hojeISO } from './engine.js';
import { lerEstadoAtual, substituirEstado } from './localApi.js';

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
 * Gera o arquivo de backup. Em celulares abre a folha de compartilhamento (Drive, WhatsApp, e-mail, "Salvar em
 * Arquivos"...); onde isso não existe, baixa o arquivo. Devolve 'compartilhado', 'baixado' ou 'cancelado'.
 */
export async function exportarBackup() {
  const estado = await lerEstadoAtual();
  const arquivo = new File([montarBackup(estado)], `controle-financeiro-backup-${hojeISO()}.json`, { type: 'application/json' });

  if (navigator.canShare?.({ files: [arquivo] })) {
    try {
      await navigator.share({ files: [arquivo], title: 'Backup do Controle Financeiro' });
      return 'compartilhado';
    } catch (e) {
      if (e?.name === 'AbortError') return 'cancelado'; // a pessoa fechou a folha de compartilhamento
      // qualquer outro erro: tenta baixar o arquivo
    }
  }
  baixar(arquivo);
  return 'baixado';
}

/** Valida o texto do backup (lança ErroLocal se estiver errado) sem alterar nada. Útil antes de pedir confirmação. */
export function conferirBackup(texto) {
  lerBackup(texto);
}

/** Substitui TODOS os dados do aparelho pelo conteúdo do backup. */
export async function importarBackup(texto) {
  await substituirEstado(lerBackup(texto));
}
