import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportarNoAparelho } from './exportarNativo.js';

// Plugins falsos com a mesma interface dos do Capacitor.
function plugins({ falhaDocumentos = false, share = 'ok' } = {}) {
  const gravados = [];
  const compartilhados = [];
  return {
    gravados, compartilhados,
    Directory: { Documents: 'DOCUMENTS', Cache: 'CACHE' },
    Encoding: { UTF8: 'utf8' },
    Filesystem: {
      async writeFile(op) {
        if (op.directory === 'DOCUMENTS' && falhaDocumentos) throw new Error('Permission denied');
        gravados.push(op);
        return { uri: `file:///${op.directory}/${op.path}` };
      },
    },
    Share: {
      async share(op) {
        if (share === 'cancelado') throw new Error('Share canceled');
        if (share === 'erro') throw new Error('Activity not found');
        compartilhados.push(op);
        return {};
      },
    },
  };
}

const NOME = 'controle-financeiro-backup-2026-11-04.json';
const TEXTO = '{"formato":"controle-financeiro-backup"}';

test('grava cópia em Documentos e abre o compartilhamento com o arquivo do cache', async () => {
  const p = plugins();
  const r = await exportarNoAparelho(NOME, TEXTO, p);
  assert.deepEqual(r, { salvoEm: `Documentos/Controle Financeiro/${NOME}`, compartilhado: true });
  assert.deepEqual(p.gravados.map((g) => [g.directory, g.path, g.data, g.encoding]), [
    ['DOCUMENTS', `Controle Financeiro/${NOME}`, TEXTO, 'utf8'],
    ['CACHE', NOME, TEXTO, 'utf8'],
  ]);
  assert.equal(p.gravados[0].recursive, true, 'cria a pasta se não existir');
  assert.deepEqual(p.compartilhados[0].files, [`file:///CACHE/${NOME}`]);
});

test('fechar a folha de compartilhamento não é erro: a cópia em Documentos continua valendo', async () => {
  const r = await exportarNoAparelho(NOME, TEXTO, plugins({ share: 'cancelado' }));
  assert.deepEqual(r, { salvoEm: `Documentos/Controle Financeiro/${NOME}`, compartilhado: false });
});

test('sem permissão em Documentos (Android antigo): usa só o compartilhamento', async () => {
  const r = await exportarNoAparelho(NOME, TEXTO, plugins({ falhaDocumentos: true }));
  assert.deepEqual(r, { salvoEm: null, compartilhado: true });
});

test('sem permissão e compartilhamento cancelado: não salvou nada, sem erro', async () => {
  const r = await exportarNoAparelho(NOME, TEXTO, plugins({ falhaDocumentos: true, share: 'cancelado' }));
  assert.deepEqual(r, { salvoEm: null, compartilhado: false });
});

test('compartilhamento com erro de verdade: lança só se também não salvou em Documentos', async () => {
  const comCopia = await exportarNoAparelho(NOME, TEXTO, plugins({ share: 'erro' }));
  assert.deepEqual(comCopia, { salvoEm: `Documentos/Controle Financeiro/${NOME}`, compartilhado: false });
  await assert.rejects(
    exportarNoAparelho(NOME, TEXTO, plugins({ falhaDocumentos: true, share: 'erro' })),
    /Não foi possível gerar o backup: Activity not found/,
  );
});
