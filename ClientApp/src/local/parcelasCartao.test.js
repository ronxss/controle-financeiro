import test from 'node:test';
import assert from 'node:assert/strict';
import {
  criarEstadoInicial, rotear, ErroLocal, validarEstado, lerBackup, montarBackup,
  faturaDaCompra, faturaDoMes, vencimentosPendentes,
} from './engine.js';
import { planejarNotificacoes } from './notificacoes.js';

const HOJE = '2026-11-15';
const api = (e, metodo, url, corpo, hoje = HOJE) => rotear(e, metodo, url, corpo, { hoje, agora: `${hoje}T12:00:00.000Z` }).corpo;
const falha = (fn, status, trecho) =>
  assert.throws(fn, (e) => e instanceof ErroLocal && e.status === status && (!trecho || e.message.includes(trecho)), trecho);
const cat = (e, nome) => e.categorias.find((c) => c.nome === nome).id;
const conta = (e, nome) => e.contas.find((c) => c.nome === nome).id;
const corpo = (e, extra) => ({
  data: '2026-11-10', tipo: 'Despesa', categoriaId: cat(e, 'Compras'), descricao: 'TV',
  contaId: conta(e, 'Conta corrente'), valor: 1000, status: 'PagoRecebido', ...extra,
});
const lista = (e, mes) => api(e, 'GET', `/api/lancamentos?mes=${mes}`);

// =============================== Parcelas ===============================

test('parcelas: divide o total em centavos exatos, um por mês, 1ª com o status escolhido', () => {
  const e = criarEstadoInicial();
  const r = api(e, 'POST', '/api/lancamentos', corpo(e, { valor: 1000, parcelas: 3, data: '2026-11-10' }));
  assert.equal(r.parcelas, 3);
  assert.equal(r.ids.length, 3);
  assert.equal(r.id, r.ids[0]);
  const todas = r.ids.map((id) => e.lancamentos.find((l) => l.id === id));
  assert.deepEqual(todas.map((l) => [l.data, l.valorCentavos, l.status, l.parcela.numero, l.parcela.total]), [
    ['2026-11-10', 33334, 'PagoRecebido', 1, 3], // 1000/3 = 333,33 + 1 centavo de diferença na 1ª
    ['2026-12-10', 33333, 'Pendente', 2, 3],
    ['2027-01-10', 33333, 'Pendente', 3, 3],
  ]);
  assert.equal(todas.reduce((t, l) => t + l.valorCentavos, 0), 100000, 'a soma bate com o total');
  assert.ok(todas.every((l) => l.parcela.grupo === r.id));
  assert.deepEqual(lista(e, '2026-12')[0].parcela, { grupo: r.id, numero: 2, total: 3 });
  assert.equal(lista(e, '2026-12')[0].descricao, 'TV', 'a descrição não muda (o número vem em "parcela")');
});

test('parcelas: dia 31 vira o último dia dos meses menores; à vista continua igual', () => {
  const e = criarEstadoInicial();
  const r = api(e, 'POST', '/api/lancamentos', corpo(e, { data: '2026-01-31', parcelas: 4, valor: 400 }));
  assert.deepEqual(r.ids.map((id) => e.lancamentos.find((l) => l.id === id).data), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  for (const p of [undefined, null, 1]) {
    const v = api(e, 'POST', '/api/lancamentos', corpo(e, { parcelas: p }));
    assert.deepEqual(Object.keys(v), ['id']);
    assert.equal(e.lancamentos.find((l) => l.id === v.id).parcela, null);
  }
});

test('parcelas: validações', () => {
  const e = criarEstadoInicial();
  for (const ruim of [0, -2, 61, 2.5, '3']) falha(() => api(e, 'POST', '/api/lancamentos', corpo(e, { parcelas: ruim })), 400, 'parcelas');
  falha(() => api(e, 'POST', '/api/lancamentos', corpo(e, { parcelas: 3, fixa: true })), 400, 'parcelado não pode ser fixo');
  falha(() => api(e, 'POST', '/api/lancamentos', corpo(e, { parcelas: 3, valor: 0.02 })), 400, 'pequeno demais');
  assert.equal(e.lancamentos.length, 0, 'nada criado pela metade');
  api(e, 'POST', '/api/lancamentos', corpo(e, { parcelas: 60, valor: 0.6 })); // 1 centavo cada
  assert.equal(e.lancamentos.length, 60);
});

test('parcelas: editar mexe só naquela parcela e não deixa virar fixa', () => {
  const e = criarEstadoInicial();
  const { ids } = api(e, 'POST', '/api/lancamentos', corpo(e, { parcelas: 3, valor: 300 }));
  api(e, 'PUT', `/api/lancamentos/${ids[1]}`, corpo(e, { data: '2026-12-10', valor: 150, status: 'Pendente' }));
  assert.deepEqual(e.lancamentos.map((l) => l.valorCentavos), [10000, 15000, 10000]);
  assert.deepEqual(e.lancamentos[1].parcela, { grupo: ids[0], numero: 2, total: 3 });
  falha(() => api(e, 'PUT', `/api/lancamentos/${ids[1]}`, corpo(e, { fixa: true })), 400, 'parcelado não pode ser fixo');
  falha(() => api(e, 'PATCH', `/api/lancamentos/${ids[1]}/fixa`, { fixa: true }), 400, 'parcelado não pode ser fixo');
  api(e, 'PATCH', `/api/lancamentos/${ids[1]}/fixa`, { fixa: false }); // desmarcar é permitido
});

test('parcelas: excluir uma, a partir dela ou todas', () => {
  const montar = () => {
    const e = criarEstadoInicial();
    const { ids } = api(e, 'POST', '/api/lancamentos', corpo(e, { parcelas: 5, valor: 500 }));
    api(e, 'POST', '/api/lancamentos', corpo(e, { descricao: 'Outra' }));
    return { e, ids };
  };
  let { e, ids } = montar();
  assert.equal(rotear(e, 'DELETE', `/api/lancamentos/${ids[2]}`).status, 204);
  assert.equal(e.lancamentos.length, 5);

  ({ e, ids } = montar());
  assert.deepEqual(api(e, 'DELETE', `/api/lancamentos/${ids[2]}?parcelas=seguintes`), { removidos: 3 });
  assert.deepEqual(e.lancamentos.map((l) => l.parcela?.numero ?? l.descricao), [1, 2, 'Outra']);

  ({ e, ids } = montar());
  assert.deepEqual(api(e, 'DELETE', `/api/lancamentos/${ids[3]}?parcelas=todas`), { removidos: 5 });
  assert.deepEqual(e.lancamentos.map((l) => l.descricao), ['Outra']);

  ({ e, ids } = montar());
  falha(() => api(e, 'DELETE', `/api/lancamentos/${ids[0]}?parcelas=x`), 400, 'parcelas');
  const avulso = e.lancamentos.find((l) => l.descricao === 'Outra').id;
  assert.deepEqual(api(e, 'DELETE', `/api/lancamentos/${avulso}?parcelas=todas`), { removidos: 1 }, 'não parcelado: só ele');
  assert.equal(e.lancamentos.length, 5);
});

test('parcelas e cartão sobrevivem ao backup; lixo vira "não tem"', () => {
  const e = criarEstadoInicial();
  api(e, 'PUT', `/api/contas/${conta(e, 'Cartão de crédito')}`, { nome: 'Cartão de crédito', cartao: { fechamento: 5, vencimento: 12 } });
  api(e, 'POST', '/api/lancamentos', corpo(e, { parcelas: 2 }));
  const volta = lerBackup(montarBackup(e));
  assert.deepEqual(volta.contas.find((c) => c.nome === 'Cartão de crédito').cartao, { fechamento: 5, vencimento: 12 });
  assert.deepEqual(volta.lancamentos[1].parcela, { grupo: 1, numero: 2, total: 2 });

  const sujo = structuredClone(e);
  sujo.contas[0].cartao = { fechamento: 0, vencimento: 10 };
  sujo.lancamentos[0].parcela = { grupo: 1, numero: 3, total: 2 };
  sujo.lancamentos[1].parcela = 'x';
  const v = validarEstado(sujo);
  assert.equal(v.contas[0].cartao, null);
  assert.equal(v.lancamentos[0].parcela, null);
  assert.equal(v.lancamentos[1].parcela, null);

  const antigo = structuredClone(e); // como uma versão anterior: sem os campos
  for (const c of antigo.contas) delete c.cartao;
  for (const l of antigo.lancamentos) delete l.parcela;
  const va = validarEstado(antigo);
  assert.ok(va.contas.every((c) => c.cartao === null) && va.lancamentos.every((l) => l.parcela === null));
});

// =============================== Cartão: cadastro ===============================

test('contas: cartão com fechamento e vencimento; PUT sem o campo mantém; null tira', () => {
  const e = criarEstadoInicial();
  const nova = api(e, 'POST', '/api/contas', { nome: 'Nubank', cartao: { fechamento: 3, vencimento: 10 } });
  assert.deepEqual(nova, { id: nova.id, nome: 'Nubank', cartao: { fechamento: 3, vencimento: 10 } });
  api(e, 'PUT', `/api/contas/${nova.id}`, { nome: 'Nubank Roxo' }); // cliente antigo
  assert.deepEqual(api(e, 'GET', '/api/contas').find((c) => c.id === nova.id).cartao, { fechamento: 3, vencimento: 10 });
  api(e, 'PUT', `/api/contas/${nova.id}`, { nome: 'Nubank Roxo', cartao: null });
  assert.equal(api(e, 'GET', '/api/contas').find((c) => c.id === nova.id).cartao, null);
  for (const ruim of [{}, { fechamento: 0, vencimento: 5 }, { fechamento: 5, vencimento: 32 }, { fechamento: '5', vencimento: 10 }, 'sim']) {
    falha(() => api(e, 'POST', '/api/contas', { nome: `X${Math.random()}`, cartao: ruim }), 400, 'fechamento');
  }
});

// =============================== Cartão: regras da fatura ===============================

test('fatura: compra até o fechamento entra no mês; depois, no seguinte; vencimento depois do fechamento', () => {
  const c = { fechamento: 5, vencimento: 12 };
  assert.deepEqual(faturaDaCompra(c, '2026-11-05'), { mes: '2026-11', fechamento: '2026-11-05', vencimento: '2026-11-12' });
  assert.deepEqual(faturaDaCompra(c, '2026-11-06'), { mes: '2026-12', fechamento: '2026-12-05', vencimento: '2026-12-12' });
  assert.deepEqual(faturaDaCompra(c, '2026-12-20'), { mes: '2027-01', fechamento: '2027-01-05', vencimento: '2027-01-12' });
});

test('fatura: vencimento antes do fechamento cai no mês seguinte; dias 29-31 em fevereiro', () => {
  const c = { fechamento: 25, vencimento: 5 };
  assert.deepEqual(faturaDaCompra(c, '2026-11-25'), { mes: '2026-12', fechamento: '2026-11-25', vencimento: '2026-12-05' });
  assert.deepEqual(faturaDaCompra(c, '2026-11-26'), { mes: '2027-01', fechamento: '2026-12-25', vencimento: '2027-01-05' });
  const fim = { fechamento: 31, vencimento: 10 };
  assert.deepEqual(faturaDaCompra(fim, '2026-02-28'), { mes: '2026-03', fechamento: '2026-02-28', vencimento: '2026-03-10' });
  assert.deepEqual(faturaDaCompra(fim, '2026-03-01'), { mes: '2026-04', fechamento: '2026-03-31', vencimento: '2026-04-10' });
  const igual = { fechamento: 10, vencimento: 10 }; // mesmo dia: vence no mês seguinte
  assert.equal(faturaDaCompra(igual, '2026-11-10').vencimento, '2026-12-10');
});

test('fatura do mês: período de compras coberto', () => {
  assert.deepEqual(faturaDoMes({ fechamento: 5, vencimento: 12 }, '2026-11'),
    { mes: '2026-11', fechamento: '2026-11-05', vencimento: '2026-11-12', inicio: '2026-10-06' });
  assert.deepEqual(faturaDoMes({ fechamento: 25, vencimento: 5 }, '2027-01'),
    { mes: '2027-01', fechamento: '2026-12-25', vencimento: '2027-01-05', inicio: '2026-11-26' });
  assert.deepEqual(faturaDoMes({ fechamento: 31, vencimento: 10 }, '2026-03'),
    { mes: '2026-03', fechamento: '2026-02-28', vencimento: '2026-03-10', inicio: '2026-02-01' });
  // coerência: toda compra do período cai na fatura daquele mês
  const c = { fechamento: 25, vencimento: 5 };
  const f = faturaDoMes(c, '2027-01');
  for (const d of ['2026-11-26', '2026-12-01', '2026-12-25']) assert.equal(faturaDaCompra(c, d).mes, '2027-01', d);
  assert.notEqual(faturaDaCompra(c, '2026-11-25').mes, '2027-01');
  assert.equal(f.inicio, '2026-11-26');
});

// =============================== Cartão: faturas na API ===============================

function comCartao() {
  const e = criarEstadoInicial();
  const id = api(e, 'POST', '/api/contas', { nome: 'Nubank', cartao: { fechamento: 5, vencimento: 12 } }).id;
  const compra = (extra) => api(e, 'POST', '/api/lancamentos', corpo(e, { contaId: id, status: 'Pendente', ...extra }));
  return { e, id, compra };
}

test('faturas: lista por mês de vencimento, total, estorno e situação', () => {
  const { e, id, compra } = comCartao();
  compra({ data: '2026-10-20', valor: 100, descricao: 'Mercado' });   // fatura de nov
  compra({ data: '2026-11-05', valor: 50, descricao: 'Farmácia' });   // fatura de nov (no dia do fechamento)
  compra({ data: '2026-11-03', valor: 30, descricao: 'Estorno', tipo: 'Receita', categoriaId: cat(e, 'Freelance') });
  compra({ data: '2026-11-06', valor: 70, descricao: 'Cinema' });     // fatura de dez
  api(e, 'POST', '/api/lancamentos', corpo(e, { descricao: 'Não é cartão' }));

  const [nov] = api(e, 'GET', '/api/cartoes?mes=2026-11');
  assert.equal(nov.contaId, id);
  assert.deepEqual([nov.mes, nov.inicio, nov.fechamento, nov.vencimento], ['2026-11', '2026-10-06', '2026-11-05', '2026-11-12']);
  assert.deepEqual(nov.itens.map((i) => i.descricao), ['Mercado', 'Estorno', 'Farmácia']);
  assert.deepEqual([nov.total, nov.pago, nov.pendente, nov.quantidade], [120, 0, 120, 3]);
  assert.equal(nov.situacao, 'vencida'); // hoje 15/11: já passou o vencimento (12/11) e há pendentes
});

test('faturas: situações aberta, fechada, vencida, paga e vazia', () => {
  const { e, compra } = comCartao();
  compra({ data: '2026-11-02', valor: 100 }); // fatura nov: fecha 05/11, vence 12/11
  const sit = (hoje, mes = '2026-11') => api(e, 'GET', `/api/cartoes?mes=${mes}`, undefined, hoje)[0].situacao;
  assert.equal(sit('2026-11-04'), 'aberta');
  assert.equal(sit('2026-11-05'), 'aberta');
  assert.equal(sit('2026-11-06'), 'fechada');
  assert.equal(sit('2026-11-12'), 'fechada');
  assert.equal(sit('2026-11-13'), 'vencida');
  assert.equal(sit('2026-11-13', '2026-12'), 'vazia');
  e.lancamentos[0].status = 'PagoRecebido';
  assert.equal(sit('2026-11-13'), 'paga');
});

test('pagar fatura: marca só as pendentes daquela fatura e daquele cartão', () => {
  const { e, id, compra } = comCartao();
  compra({ data: '2026-10-20', valor: 100 });
  compra({ data: '2026-11-01', valor: 50, status: 'PagoRecebido' });
  compra({ data: '2026-11-10', valor: 70 }); // dezembro
  const outro = api(e, 'POST', '/api/contas', { nome: 'Inter', cartao: { fechamento: 5, vencimento: 12 } }).id;
  api(e, 'POST', '/api/lancamentos', corpo(e, { contaId: outro, data: '2026-10-21', status: 'Pendente' }));

  const r = rotear(e, 'POST', `/api/cartoes/${id}/pagar`, { mes: '2026-11' }, { hoje: HOJE });
  assert.equal(r.corpo.pagos, 1);
  assert.equal(r.corpo.fatura.situacao, 'paga');
  assert.equal(r.alterou, true);
  assert.deepEqual(e.lancamentos.map((l) => l.status), ['PagoRecebido', 'PagoRecebido', 'Pendente', 'Pendente']);
  assert.equal(rotear(e, 'POST', `/api/cartoes/${id}/pagar`, { mes: '2026-11' }, { hoje: HOJE }).alterou, false, 'pagar de novo não grava');

  falha(() => api(e, 'POST', `/api/cartoes/${conta(e, 'Dinheiro')}/pagar`, { mes: '2026-11' }), 400, 'não é um cartão');
  falha(() => api(e, 'POST', '/api/cartoes/999/pagar', { mes: '2026-11' }), 404);
  falha(() => api(e, 'POST', `/api/cartoes/${id}/pagar`, { mes: '2026-13' }), 400, 'Mês inválido');
  falha(() => api(e, 'GET', '/api/cartoes?mes=x'), 400, 'Mês inválido');
});

test('lançamento no cartão informa a fatura; parcelas caem em faturas seguidas', () => {
  const { e, compra } = comCartao();
  compra({ data: '2026-11-20', valor: 300, parcelas: 3 });
  assert.deepEqual(
    ['2026-11', '2026-12', '2027-01'].map((m) => lista(e, m)[0].fatura),
    ['2026-12', '2027-01', '2027-02'],
  );
  assert.equal(lista(e, '2026-11').length, 1);
  assert.deepEqual(['2026-12', '2027-01', '2027-02'].map((m) => api(e, 'GET', `/api/cartoes?mes=${m}`)[0].total), [100, 100, 100]);
});

// =============================== Vencimentos (avisos e notificações) ===============================

test('vencimentos: compras no cartão viram a fatura, pelo vencimento dela', () => {
  const { e, id, compra } = comCartao();
  compra({ data: '2026-11-08', valor: 100, descricao: 'Mercado' });  // fatura dez (vence 12/12)
  compra({ data: '2026-11-09', valor: 20, descricao: 'Padaria' });   // idem
  compra({ data: '2026-11-07', valor: 200, status: 'PagoRecebido' }); // paga: não conta
  api(e, 'POST', '/api/lancamentos', corpo(e, { descricao: 'Aluguel', data: '2026-11-20', status: 'Pendente' }));

  const v = vencimentosPendentes(e);
  assert.deepEqual(v.map((x) => [x.tipo, x.descricao, x.data, x.valorCentavos]), [
    ['Despesa', 'Aluguel', '2026-11-20', 100000],
    ['Fatura', 'Fatura Nubank', '2026-12-12', 12000],
  ]);
  assert.equal(v[1].contaId, id);
  assert.equal(v[1].fatura, '2026-12');

  const r = api(e, 'GET', '/api/lembretes?dias=30');
  assert.deepEqual(r.proximos.map((x) => [x.descricao, x.dias, x.valor]), [['Aluguel', 5, 1000], ['Fatura Nubank', 27, 120]]);
  assert.equal(r.totais.despesasProximas, 1120, 'fatura conta como despesa');
  assert.ok(r.atrasados.length === 0, 'compras no cartão não ficam "atrasadas" pela data da compra');
});

test('vencimentos: fatura só com estorno não aparece; notificação usa o vencimento da fatura', () => {
  const { e, compra } = comCartao();
  compra({ data: '2026-11-08', valor: 30, tipo: 'Receita', categoriaId: cat(e, 'Freelance'), descricao: 'Estorno' });
  assert.deepEqual(vencimentosPendentes(e), []);

  compra({ data: '2026-11-08', valor: 130, descricao: 'Mercado' });
  api(e, 'PUT', '/api/config', { lembretes: { ativo: true, diasAntes: 1, hora: 9 } });
  const p = planejarNotificacoes(e, { agora: new Date(2026, 10, 15, 8) });
  assert.deepEqual(p.map((x) => x.titulo), ['Fatura Nubank vence amanhã', 'Fatura Nubank vence hoje']);
  assert.match(p[0].texto, /R\$\s100,00/);
  assert.equal(p[0].quando.getTime(), new Date(2026, 11, 11, 9).getTime());
  assert.ok(p.every((x) => Number.isInteger(x.id) && x.id > 0 && x.id < 2 ** 31));
  assert.notEqual(p[0].id, p[1].id);
});

test('notificações: faturas de meses e cartões diferentes e lançamentos comuns nunca repetem id', () => {
  const { e, compra } = comCartao();
  const outro = api(e, 'POST', '/api/contas', { nome: 'Inter', cartao: { fechamento: 5, vencimento: 12 } }).id;
  compra({ data: '2026-11-08', valor: 10 }); // fatura dez
  compra({ data: '2026-12-08', valor: 10 }); // fatura jan
  compra({ data: '2027-01-08', valor: 10 }); // fatura fev
  api(e, 'POST', '/api/lancamentos', corpo(e, { contaId: outro, data: '2026-11-08', status: 'Pendente' }));
  for (let i = 0; i < 5; i += 1) api(e, 'POST', '/api/lancamentos', corpo(e, { data: '2026-11-20', status: 'Pendente' }));
  api(e, 'PUT', '/api/config', { lembretes: { ativo: true, diasAntes: 3 } });
  const p = planejarNotificacoes(e, { agora: new Date(2026, 10, 15, 8) });
  assert.equal(p.filter((x) => x.titulo.startsWith('Fatura')).length, 8, '4 faturas x 2 avisos');
  assert.equal(new Set(p.map((x) => x.id)).size, p.length);
});
