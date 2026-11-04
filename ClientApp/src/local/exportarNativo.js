// Exportação do backup dentro do APK (Capacitor / WebView Android).
//
// A WebView do Android não baixa arquivos por <a download> e não tem navigator.share com arquivos. Por isso, no
// app nativo, o arquivo é gravado com o plugin Filesystem e oferecido pela folha de compartilhamento do Android
// (plugin Share): dá para mandar para o Drive, e-mail, WhatsApp, "Arquivos" etc.
//
// Além disso, uma cópia é gravada em Documentos/Controle Financeiro, para o backup existir mesmo se a pessoa fechar
// a folha de compartilhamento. Em Androids antigos (9 ou menos) essa cópia pode falhar por permissão: aí só a folha
// de compartilhamento é usada.
//
// Os plugins chegam por parâmetro para o módulo poder ser testado no Node sem Android.

export const PASTA_DOCUMENTOS = 'Controle Financeiro';

const cancelou = (e) => /cancel/i.test(String(e?.message ?? e ?? ''));

/**
 * Devolve { salvoEm: 'Documentos/Controle Financeiro/arquivo.json' | null, compartilhado: boolean }.
 * Lança erro só se não conseguir nem salvar a cópia nem abrir o compartilhamento.
 */
export async function exportarNoAparelho(nome, texto, { Filesystem, Directory, Encoding, Share }, titulo = 'Backup do Controle Financeiro') {
  let salvoEm = null;
  try {
    await Filesystem.writeFile({
      path: `${PASTA_DOCUMENTOS}/${nome}`, data: texto, directory: Directory.Documents, encoding: Encoding.UTF8, recursive: true,
    });
    salvoEm = `Documentos/${PASTA_DOCUMENTOS}/${nome}`;
  } catch {
    // sem permissão para a pasta pública: segue só com o compartilhamento
  }

  let compartilhado = false;
  let erroCompartilhar = null;
  try {
    const { uri } = await Filesystem.writeFile({ path: nome, data: texto, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: titulo, files: [uri], dialogTitle: 'Salvar ou enviar o arquivo' });
    compartilhado = true;
  } catch (e) {
    if (!cancelou(e)) erroCompartilhar = e;
  }

  if (!salvoEm && erroCompartilhar) {
    throw new Error(`Não foi possível gerar o arquivo: ${erroCompartilhar.message || erroCompartilhar}`);
  }
  return { salvoEm, compartilhado };
}
