import test from 'node:test';
import assert from 'node:assert/strict';
import { criarEstadoInicial, rotear, ErroLocal, validarEstado, lerBackup, montarBackup, gerarCsv } from './engine.js';

const HOJE = '2026-11-15';
const api = (e, metodo, url, corpo, hoje = HOJE) => rotear(e, metodo, url, corpo, { hoje, agora: `${hoje}T12:00:00.000Z` }).corpo;
const falha = (fn, status, trecho) =>
  assert.throws(fn, (e) => e instanceof ErroLocal && e.status === status && (!trecho || e.message.includes(trecho)), trecho);

// =============================== Metas ===============================

test('metas: criar, listar e calcular quanto guardar por mês', () => {
  const e = criarEstadoInicial();
  const m = api(e, 'POST', '/api/metas', { nome: ' Viagem ', alvo: 5000, prazo: '2027-06-30' });
  assert.equal(m.nome, 'Viagem');
  assert.deepEqual([m.alvo, m.guardado, m.falta, m.percentual], [5000, 0, 5000, 0]);
  assert.equal(m.mesesRestantes, 8); // nov/26 a jun/27, contando o mês atual
  assert.equal(m.mensalSugerido, 625);
  assert.equal(m.situacao, 'noRitmo', 'acabou de criar: ainda não deveria ter nada');
  assert.deepEqual(m.aportes, []);
  assert.equal(api(e, 'GET', '/api/metas').length, 1);
});

test('metas: depósitos, retiradas, progresso e conclusão', () => {
  const e = criarEstadoInicial();
  const { id } = api(e, 'POST', '/api/metas', { nome: 'Reserva', alvo: 1000 });
  let m = api(e, 'POST', `/api/metas/${id}/aportes`, { valor: 300.5, nota: 'salário' });
  m = api(e, 'POST', `/api/metas/${id}/aportes`, { valor: 100.5, retirada: true, data: '2026-11-16' });
  assert.deepEqual([m.guardado, m.falta, m.percentual], [200, 800, 20]);
  assert.deepEqual(m.aportes.map((a) => [a.data, a.valor, a.nota]), [['2026-11-16', -100.5, ''], ['2026-11-15', 300.5, 'salário']]);
  assert.equal(m.situacao, 'semPrazo');
  assert.equal(m.mensalSugerido, null);

  m = api(e, 'POST', `/api/metas/${id}/aportes`, { valor: 900 });
  assert.deepEqual([m.guardado, m.falta, m.percentual, m.situacao], [1100, 0, 100, 'concluida']);
});

test('metas: retirada maior que o guardado e outras validações', () => {
  const e = criarEstadoInicial();
  const { id } = api(e, 'POST', '/api/metas', { nome: 'Carro', alvo: 100 });
  api(e, 'POST', `/api/metas/${id}/aportes`, { valor: 50 });
  falha(() => api(e, 'POST', `/api/metas/${id}/aportes`, { valor: 50.01, retirada: true }), 400, 'maior que o valor guardado');
  api(e, 'POST', `/api/metas/${id}/aportes`, { valor: 50, retirada: true }); // exatamente tudo: ok
  for (const v of [0, -5, 'x', undefined]) falha(() => api(e, 'POST', `/api/metas/${id}/aportes`, { valor: v }), 400, 'maior que zero');
  falha(() => api(e, 'POST', `/api/metas/${id}/aportes`, { valor: 1, retirada: 'sim' }), 400, 'retirada');
  falha(() => api(e, 'POST', `/api/metas/${id}/aportes`, { valor: 1, data: '2026-02-30' }), 400, 'Data inválida');
  falha(() => api(e, 'POST', `/api/metas/${id}/aportes`, { valor: 1, nota: 'x'.repeat(101) }), 400, '100 caracteres');
  falha(() => api(e, 'POST', '/api/metas/999/aportes', { valor: 1 }), 404);

  falha(() => api(e, 'POST', '/api/metas', { nome: '', alvo: 10 }), 400, 'nome');
  falha(() => api(e, 'POST', '/api/metas', { nome: 'x'.repeat(61), alvo: 10 }), 400, '60');
  falha(() => api(e, 'POST', '/api/metas', { nome: 'A', alvo: 0 }), 400, 'valor-alvo');
  falha(() => api(e, 'POST', '/api/metas', { nome: 'A', alvo: 10, prazo: '31/12/2026' }), 400, 'Prazo');
  falha(() => api(e, 'POST', '/api/metas', { nome: 'carro', alvo: 10 }), 409, 'Já existe');
});

test('metas: editar, excluir e excluir depósito (sem deixar saldo negativo)', () => {
  const e = criarEstadoInicial();
  const { id } = api(e, 'POST', '/api/metas', { nome: 'PC', alvo: 3000 });
  const outra = api(e, 'POST', '/api/metas', { nome: 'Celular', alvo: 2000 }).id;
  const m = api(e, 'PUT', `/api/metas/${id}`, { nome: 'Computador', alvo: 4000, prazo: '2026-12-31' });
  assert.deepEqual([m.nome, m.alvo, m.prazo], ['Computador', 4000, '2026-12-31']);
  falha(() => api(e, 'PUT', `/api/metas/${id}`, { nome: 'CELULAR', alvo: 1 }), 409);

  const dep = api(e, 'POST', `/api/metas/${id}/aportes`, { valor: 100 }).aportes[0].id;
  const ret = api(e, 'POST', `/api/metas/${id}/aportes`, { valor: 60, retirada: true }).aportes[0].id;
  falha(() => api(e, 'DELETE', `/api/aportes/${dep}`), 400, 'saldo negativo');
  api(e, 'DELETE', `/api/aportes/${ret}`);
  api(e, 'DELETE', `/api/aportes/${dep}`);
  assert.equal(api(e, 'GET', '/api/metas').find((x) => x.id === id).guardado, 0);
  falha(() => api(e, 'DELETE', `/api/aportes/${dep}`), 404);

  api(e, 'DELETE', `/api/metas/${outra}`);
  assert.deepEqual(api(e, 'GET', '/api/metas').map((x) => x.nome), ['Computador']);
  falha(() => api(e, 'DELETE', `/api/metas/${outra}`), 404);
});

test('metas: ritmo, atraso e ordem da lista', () => {
  const e = criarEstadoInicial();
  // criadas em 01/01/2026, prazo 31/12/2026 (364 dias depois), alvo 3640: o esperado cresce 10 por dia
  const criar = (nome, alvo, prazo) => api(e, 'POST', '/api/metas', { nome, alvo, prazo }, '2026-01-01').id;
  const ritmo = criar('No ritmo', 3640, '2026-12-31');
  const abaixo = criar('Abaixo', 3640, '2026-12-31');
  const venceu = criar('Venceu', 100, '2026-10-31');
  const pronta = criar('Pronta', 10, null);
  criar('Sem prazo', 10, null);
  api(e, 'POST', `/api/metas/${ritmo}/aportes`, { valor: 3180 }); // 15/11 = dia 318: esperado 3180
  api(e, 'POST', `/api/metas/${abaixo}/aportes`, { valor: 3179.99 });
  api(e, 'POST', `/api/metas/${venceu}/aportes`, { valor: 50 });
  api(e, 'POST', `/api/metas/${pronta}/aportes`, { valor: 10 });
  const lista = api(e, 'GET', '/api/metas');
  assert.deepEqual(lista.map((x) => [x.nome, x.situacao]), [
    ['Venceu', 'atrasada'], ['Abaixo', 'abaixoDoRitmo'], ['No ritmo', 'noRitmo'], ['Sem prazo', 'semPrazo'], ['Pronta', 'concluida'],
  ]);
  const r = lista.find((x) => x.nome === 'No ritmo');
  assert.equal(r.mesesRestantes, 2);
  assert.equal(r.mensalSugerido, 230); // falta 460 em 2 meses
  assert.equal(lista.find((x) => x.nome === 'Venceu').mensalSugerido, null);
  // no último dia do prazo ainda conta 1 mês
  assert.equal(api(e, 'GET', '/api/metas', undefined, '2026-12-31').find((x) => x.nome === 'Abaixo').mesesRestantes, 1);
});

test('metas: sugestão mensal arredonda para cima (não falta 1 centavo no fim)', () => {
  const e = criarEstadoInicial();
  const m = api(e, 'POST', '/api/metas', { nome: 'X', alvo: 100, prazo: '2027-01-15' }); // 3 meses
  assert.equal(m.mensalSugerido, 33.34);
});

test('metas viajam no backup; backup antigo sem metas é válido; lixo é recusado', () => {
  const e = criarEstadoInicial();
  const { id } = api(e, 'POST', '/api/metas', { nome: 'Casa', alvo: 1000 });
  api(e, 'POST', `/api/metas/${id}/aportes`, { valor: 10, nota: 'início' });
  const volta = lerBackup(montarBackup(e));
  assert.equal(volta.metas[0].aportes[0].nota, 'início');
  assert.equal(volta.seq.meta, 1);
  assert.equal(volta.seq.aporte, 1);

  const antigo = structuredClone(e);
  delete antigo.metas;
  delete antigo.seq.meta;
  delete antigo.seq.aporte;
  const va = validarEstado(antigo);
  assert.deepEqual(va.metas, []);
  assert.deepEqual([va.seq.meta, va.seq.aporte], [0, 0]);
  // depois de importar um backup antigo, criar meta continua funcionando
  assert.equal(api(va, 'POST', '/api/metas', { nome: 'Nova', alvo: 1 }).id, 1);

  for (const estrago of [
    (x) => { x.metas = 'x'; },
    (x) => { x.metas[0].alvoCentavos = 0; },
    (x) => { x.metas[0].aportes = null; },
    (x) => { x.metas[0].aportes[0].valorCentavos = 1.5; },
    (x) => { x.metas[0].aportes.push({ ...x.metas[0].aportes[0] }); },
    (x) => { x.metas[0].prazo = 'amanhã'; },
  ]) {
    const ruim = structuredClone(e);
    estrago(ruim);
    falha(() => validarEstado(ruim), 400, 'Backup inválido');
  }
  // seq menor que os ids existentes é corrigido
  const seq = structuredClone(e);
  seq.seq.meta = 0;
  seq.seq.aporte = 0;
  assert.deepEqual([validarEstado(seq).seq.meta, validarEstado(seq).seq.aporte], [1, 1]);
});

// =============================== CSV ===============================

function comDados() {
  const e = criarEstadoInicial();
  const cat = (n) => e.categorias.find((c) => c.nome === n).id;
  const conta = (n) => e.contas.find((c) => c.nome === n).id;
  const novo = (extra) => api(e, 'POST', '/api/lancamentos', {
    data: '2026-11-10', tipo: 'Despesa', categoriaId: cat('Alimentação'), descricao: 'Mercado',
    contaId: conta('Conta corrente'), valor: 1234.5, status: 'PagoRecebido', ...extra,
  });
  return { e, cat, conta, novo };
}

test('CSV: cabeçalho, formato brasileiro, sinal do valor, BOM e CRLF', () => {
  const { e, cat, novo } = comDados();
  novo({});
  novo({ data: '2026-11-05', tipo: 'Receita', categoriaId: cat('Salário'), descricao: 'Salário', valor: 5000, status: 'Pendente', fixa: true });
  const { texto, quantidade } = gerarCsv(e);
  assert.equal(quantidade, 2);
  assert.ok(texto.startsWith('﻿'), 'BOM para o Excel ler os acentos');
  const linhas = texto.slice(1).split('\r\n');
  assert.equal(linhas.at(-1), '', 'termina com quebra de linha');
  assert.deepEqual(linhas.slice(0, 3), [
    'Data;Tipo;Descrição;Categoria;Conta;Valor;Status;Fixa;Parcela;Fatura',
    '05/11/2026;Receita;Salário;Salário;Conta corrente;5000,00;Pendente;Sim;;',
    '10/11/2026;Despesa;Mercado;Alimentação;Conta corrente;-1234,50;Pago;Não;;',
  ]);
});

test('CSV: aspas, ponto e vírgula, quebra de linha e proteção contra fórmulas', () => {
  const { e, novo } = comDados();
  for (const d of ['Jantar; bar', 'Disse "oi"', '=HYPERLINK("http://x")', '+55 11', '-desconto', '@soma', 'Linha\nnova']) {
    novo({ descricao: d });
  }
  const linhas = gerarCsv(e).texto.slice(1).split('\r\n').slice(1, -1);
  const desc = linhas.map((l) => l.split(';').slice(2).join(';').replace(/;Alimentação.*$/, ''));
  assert.deepEqual(desc, [
    '"Jantar; bar"', '"Disse ""oi"""', `"'=HYPERLINK(""http://x"")"`, "'+55 11", "'-desconto", "'@soma", '"Linha\nnova"',
  ]);
});

test('CSV: período, parcela e fatura do cartão', () => {
  const { e, conta, novo } = comDados();
  api(e, 'PUT', `/api/contas/${conta('Cartão de crédito')}`, { nome: 'Cartão de crédito', cartao: { fechamento: 5, vencimento: 12 } });
  novo({ data: '2026-10-31', descricao: 'Outubro' });
  novo({ data: '2026-11-20', descricao: 'TV', contaId: conta('Cartão de crédito'), valor: 300, parcelas: 3, status: 'Pendente' });
  novo({ data: '2026-12-01', descricao: 'Dezembro' });
  const nov = gerarCsv(e, { de: '2026-11-01', ate: '2026-11-30' });
  assert.equal(nov.quantidade, 1);
  assert.match(nov.texto, /20\/11\/2026;Despesa;TV;Compras|20\/11\/2026;Despesa;TV;Alimentação/);
  assert.match(nov.texto, /;-100,00;Pendente;Não;1\/3;12\/2026\r\n$/);
  assert.equal(gerarCsv(e).quantidade, 5);
  assert.equal(gerarCsv(e, { de: '2026-12-01' }).quantidade, 3, 'dezembro + parcelas 2 e 3');
  assert.equal(gerarCsv(e, { ate: '2026-10-31' }).quantidade, 1);
  assert.equal(gerarCsv(criarEstadoInicial()).quantidade, 0);
});
