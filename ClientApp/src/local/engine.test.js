// Testes do motor local. Rodam com: npm test   (usa o test runner nativo do Node, sem dependências).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  criarEstadoInicial, rotear, ErroLocal, montarBackup, lerBackup, validarEstado, hojeISO, somarMeses, diasNoMes,
} from './engine.js';

const HOJE = '2026-11-15';

/** Atalho: chama a "API" e devolve só o corpo. */
const api = (estado, metodo, url, corpo) => rotear(estado, metodo, url, corpo, { hoje: HOJE }).corpo;

/** Espera um erro com a mensagem e o status da API original. */
function falha(fn, status, mensagem) {
  assert.throws(fn, (e) => {
    assert.ok(e instanceof ErroLocal, `esperava ErroLocal, veio ${e}`);
    assert.equal(e.status, status);
    if (mensagem) assert.equal(e.message, mensagem);
    return true;
  });
}

const idCategoria = (estado, nome) => estado.categorias.find((c) => c.nome === nome).id;
const idConta = (estado, nome) => estado.contas.find((c) => c.nome === nome).id;

function lanc(estado, extra = {}) {
  return {
    data: '2026-11-10', tipo: 'Despesa', categoriaId: idCategoria(estado, 'Alimentação'),
    descricao: 'Mercado', contaId: idConta(estado, 'Conta corrente'), valor: 100, status: 'PagoRecebido', ...extra,
  };
}

test('estado inicial traz as listas da planilha', () => {
  const e = criarEstadoInicial();
  assert.equal(e.categorias.filter((c) => c.tipo === 'Receita').length, 3);
  assert.equal(e.categorias.filter((c) => c.tipo === 'Despesa').length, 11);
  assert.equal(e.contas.length, 5);
  assert.ok(e.categorias.filter((c) => c.tipo === 'Despesa').every((c) => c.limiteCentavos === 0));
  assert.ok(e.categorias.filter((c) => c.tipo === 'Receita').every((c) => c.limiteCentavos === null));
});

test('GET /api/categorias: ordena por tipo e nome e usa limiteMensal em reais', () => {
  const e = criarEstadoInicial();
  const lista = api(e, 'GET', '/api/categorias');
  assert.equal(lista[0].tipo, 'Despesa'); // "Despesa" vem antes de "Receita", como no SQL Server
  assert.equal(lista.at(-1).tipo, 'Receita');
  const despesas = lista.filter((c) => c.tipo === 'Despesa').map((c) => c.nome);
  assert.deepEqual(despesas, [...despesas].sort((a, b) => a.localeCompare(b, 'pt-BR')));
  assert.equal(lista.find((c) => c.nome === 'Salário').limiteMensal, null);
  assert.equal(lista.find((c) => c.nome === 'Moradia').limiteMensal, 0);
});

test('lançamento: cria, lista no formato da API e devolve só o id no POST', () => {
  const e = criarEstadoInicial();
  const criado = api(e, 'POST', '/api/lancamentos', lanc(e, { valor: 150.9 }));
  assert.deepEqual(Object.keys(criado), ['id']);

  const [item] = api(e, 'GET', '/api/lancamentos?mes=2026-11');
  assert.deepEqual(item, {
    id: criado.id, data: '2026-11-10', tipo: 'Despesa', categoriaId: idCategoria(e, 'Alimentação'), categoria: 'Alimentação',
    descricao: 'Mercado', contaId: idConta(e, 'Conta corrente'), conta: 'Conta corrente', valor: 150.9, status: 'PagoRecebido',
    fixa: false, parcela: null, fatura: null,
  });
});

test('lançamento: aplica as mesmas validações e mensagens da API', () => {
  const e = criarEstadoInicial();
  const post = (extra) => () => api(e, 'POST', '/api/lancamentos', lanc(e, extra));

  falha(post({ data: '' }), 400, 'Informe a data.');
  falha(post({ data: '2026-02-31' }), 400, 'Data inválida.');
  falha(post({ tipo: undefined }), 400, 'Informe o tipo.');
  falha(post({ categoriaId: undefined }), 400, 'Selecione a categoria.');
  falha(post({ descricao: '   ' }), 400, 'Informe a descrição.');
  falha(post({ descricao: 'x'.repeat(201) }), 400, 'A descrição deve ter no máximo 200 caracteres.');
  falha(post({ contaId: undefined }), 400, 'Selecione a conta.');
  falha(post({ valor: 0 }), 400, 'O valor deve ser maior que zero.');
  falha(post({ valor: -5 }), 400, 'O valor deve ser maior que zero.');
  falha(post({ valor: 0.004 }), 400, 'O valor deve ser maior que zero.');
  falha(post({ valor: 1_000_000_000 }), 400, 'O valor deve ser maior que zero.');
  falha(post({ status: undefined }), 400, 'Informe o status.');
  falha(post({ categoriaId: 9999 }), 400, 'Categoria inválida.');
  falha(post({ contaId: 9999 }), 400, 'Conta inválida.');
  falha(post({ tipo: 'Receita' }), 400, 'A categoria selecionada não corresponde ao tipo do lançamento.');
  assert.equal(e.lancamentos.length, 0, 'nenhum lançamento inválido pode ser gravado');
  assert.equal(e.seq.lancamento, 0, 'o contador não avança em caso de erro');

  api(e, 'POST', '/api/lancamentos', lanc(e, { valor: 999_999_999.99 })); // limite máximo é aceito
  assert.equal(e.lancamentos.length, 1);
});

test('lançamento: valores são exatos em centavos (sem erro de ponto flutuante)', () => {
  const e = criarEstadoInicial();
  api(e, 'POST', '/api/lancamentos', lanc(e, { valor: 0.1 }));
  api(e, 'POST', '/api/lancamentos', lanc(e, { valor: 0.2 }));
  api(e, 'POST', '/api/lancamentos', lanc(e, { valor: 0.29 }));
  const r = api(e, 'GET', '/api/resumo?mes=2026-11');
  assert.equal(r.despesasPagas, 0.59); // 0,1 + 0,2 + 0,29 em float daria 0,5900000000000001
  assert.equal(e.lancamentos.find((l) => l.valorCentavos === 29).valorCentavos, 29);
});

test('lançamento: editar, alternar status e excluir; ids inexistentes dão 404', () => {
  const e = criarEstadoInicial();
  const { id } = api(e, 'POST', '/api/lancamentos', lanc(e));

  assert.equal(api(e, 'PUT', `/api/lancamentos/${id}`, lanc(e, { descricao: 'Feira', valor: 80 })), null);
  assert.equal(api(e, 'GET', '/api/lancamentos?mes=2026-11')[0].descricao, 'Feira');

  api(e, 'PATCH', `/api/lancamentos/${id}/status`, { status: 'Pendente' });
  assert.equal(api(e, 'GET', '/api/lancamentos?mes=2026-11')[0].status, 'Pendente');
  falha(() => api(e, 'PATCH', `/api/lancamentos/${id}/status`, {}), 400, 'Informe o status.');

  falha(() => api(e, 'PUT', '/api/lancamentos/999', lanc(e)), 404, 'Registro não encontrado.');
  falha(() => api(e, 'PATCH', '/api/lancamentos/999/status', { status: 'Pendente' }), 404);
  falha(() => api(e, 'DELETE', '/api/lancamentos/999'), 404);

  api(e, 'DELETE', `/api/lancamentos/${id}`);
  assert.equal(api(e, 'GET', '/api/lancamentos?mes=2026-11').length, 0);
});

test('listagem: filtros, busca sem diferenciar maiúsculas e ordem por data e id decrescentes', () => {
  const e = criarEstadoInicial();
  const salario = idCategoria(e, 'Salário');
  const a = api(e, 'POST', '/api/lancamentos', lanc(e, { descricao: 'Padaria Central', data: '2026-11-05' }));
  const b = api(e, 'POST', '/api/lancamentos', lanc(e, { descricao: 'Mercado', data: '2026-11-20' }));
  const c = api(e, 'POST', '/api/lancamentos', lanc(e, { descricao: 'Feira', data: '2026-11-20', status: 'Pendente' }));
  const d = api(e, 'POST', '/api/lancamentos', lanc(e, { tipo: 'Receita', categoriaId: salario, descricao: 'Salário', data: '2026-11-01' }));
  api(e, 'POST', '/api/lancamentos', lanc(e, { descricao: 'Outro mês', data: '2026-10-31' }));

  const ids = (url) => api(e, 'GET', url).map((l) => l.id);
  assert.deepEqual(ids('/api/lancamentos?mes=2026-11'), [c.id, b.id, a.id, d.id]); // data desc, depois id desc
  assert.deepEqual(ids('/api/lancamentos?mes=2026-11&tipo=Receita'), [d.id]);
  assert.deepEqual(ids('/api/lancamentos?mes=2026-11&status=Pendente'), [c.id]);
  assert.deepEqual(ids('/api/lancamentos?mes=2026-11&busca=PADARIA'), [a.id]);
  assert.deepEqual(ids(`/api/lancamentos?mes=2026-11&categoriaId=${salario}`), [d.id]);
  assert.deepEqual(ids('/api/lancamentos'), [c.id, b.id, a.id, d.id], 'sem mês, usa o mês atual');
  falha(() => api(e, 'GET', '/api/lancamentos?mes=2026-11&tipo=Xis'), 400, 'Tipo inválido.');
});

test('mês inválido gera o mesmo erro da API', () => {
  const e = criarEstadoInicial();
  for (const mes of ['2026-13', '2026-00', '26-11', 'novembro', '2026-1']) {
    falha(() => api(e, 'GET', `/api/lancamentos?mes=${mes}`), 400, 'Mês inválido. Use o formato AAAA-MM.');
    falha(() => api(e, 'GET', `/api/resumo?mes=${mes}`), 400, 'Mês inválido. Use o formato AAAA-MM.');
    falha(() => api(e, 'GET', `/api/orcamento?mes=${mes}`), 400, 'Mês inválido. Use o formato AAAA-MM.');
  }
});

test('resumo: separa realizado de pendente e calcula os saldos', () => {
  const e = criarEstadoInicial();
  const salario = idCategoria(e, 'Salário');
  const freela = idCategoria(e, 'Freelance');
  const lazer = idCategoria(e, 'Lazer');
  api(e, 'POST', '/api/lancamentos', lanc(e, { tipo: 'Receita', categoriaId: salario, valor: 5000 }));
  api(e, 'POST', '/api/lancamentos', lanc(e, { tipo: 'Receita', categoriaId: freela, valor: 700, status: 'Pendente' }));
  api(e, 'POST', '/api/lancamentos', lanc(e, { valor: 1200.5 }));
  api(e, 'POST', '/api/lancamentos', lanc(e, { categoriaId: lazer, valor: 300 }));
  api(e, 'POST', '/api/lancamentos', lanc(e, { categoriaId: lazer, valor: 90, status: 'Pendente' }));
  api(e, 'POST', '/api/lancamentos', lanc(e, { valor: 999, data: '2026-10-30' })); // fora do mês

  const r = api(e, 'GET', '/api/resumo?mes=2026-11');
  assert.equal(r.receitasRecebidas, 5000);
  assert.equal(r.despesasPagas, 1500.5);
  assert.equal(r.saldoRealizado, 3499.5);
  assert.equal(r.receitasPendentes, 700);
  assert.equal(r.despesasPendentes, 90);
  assert.equal(r.saldoPrevisto, 4109.5); // 5000 − 1500,50 + 700 − 90

  // todas as categorias de despesa aparecem; só o "pago" conta; ordem: maior realizado primeiro
  assert.equal(r.despesasPorCategoria.length, 11);
  assert.deepEqual(r.despesasPorCategoria.slice(0, 2), [
    { categoria: 'Alimentação', realizado: 1200.5 },
    { categoria: 'Lazer', realizado: 300 },
  ]);
  assert.equal(r.despesasPorCategoria[2].realizado, 0);
  assert.deepEqual(Object.keys(r), [
    'receitasRecebidas', 'despesasPagas', 'saldoRealizado', 'receitasPendentes', 'despesasPendentes', 'saldoPrevisto', 'despesasPorCategoria',
  ]);
});

test('orçamento: limite, realizado, disponível e percentual; salvar limites', () => {
  const e = criarEstadoInicial();
  const alim = idCategoria(e, 'Alimentação');
  const moradia = idCategoria(e, 'Moradia');
  api(e, 'POST', '/api/lancamentos', lanc(e, { valor: 450 }));
  api(e, 'POST', '/api/lancamentos', lanc(e, { valor: 50, status: 'Pendente' })); // pendente não entra no realizado

  assert.equal(api(e, 'PUT', '/api/orcamento', [
    { categoriaId: alim, limite: 600 }, { categoriaId: moradia, limite: null }, { categoriaId: 9999, limite: 10 },
    { categoriaId: idCategoria(e, 'Salário'), limite: 77 }, // receita: ignorada, como na API
  ]), null);

  const itens = api(e, 'GET', '/api/orcamento?mes=2026-11');
  assert.equal(itens.length, 11, 'só categorias de despesa');
  assert.deepEqual(itens.find((i) => i.categoriaId === alim), {
    categoriaId: alim, categoria: 'Alimentação', limite: 600, realizado: 450, disponivel: 150, percentual: 75,
  });
  assert.deepEqual(itens.find((i) => i.categoriaId === moradia), {
    categoriaId: moradia, categoria: 'Moradia', limite: 0, realizado: 0, disponivel: 0, percentual: 0,
  });
  assert.equal(e.categorias.find((c) => c.nome === 'Salário').limiteCentavos, null);

  api(e, 'PUT', '/api/orcamento', [{ categoriaId: alim, limite: 400 }]);
  const estourado = api(e, 'GET', '/api/orcamento?mes=2026-11').find((i) => i.categoriaId === alim);
  assert.equal(estourado.disponivel, -50);
  assert.equal(estourado.percentual, 112.5);

  falha(() => api(e, 'PUT', '/api/orcamento', [{ categoriaId: alim, limite: -1 }]), 400, 'O limite não pode ser negativo.');
  falha(() => api(e, 'PUT', '/api/orcamento', { categoriaId: alim }), 400);
});

test('categorias: duplicadas (sem diferenciar maiúsculas), tipo e limite', () => {
  const e = criarEstadoInicial();
  falha(() => api(e, 'POST', '/api/categorias', { nome: 'moradia', tipo: 'Despesa' }), 409, 'Já existe uma categoria com esse nome.');
  falha(() => api(e, 'POST', '/api/categorias', { nome: '  ', tipo: 'Despesa' }), 400, 'Informe o nome.');
  falha(() => api(e, 'POST', '/api/categorias', { nome: 'x'.repeat(61), tipo: 'Despesa' }), 400, 'O nome deve ter no máximo 60 caracteres.');
  falha(() => api(e, 'POST', '/api/categorias', { nome: 'Pets' }), 400, 'Informe o tipo.');

  const despesa = api(e, 'POST', '/api/categorias', { nome: ' Pets ', tipo: 'Despesa' });
  assert.deepEqual(despesa, { id: despesa.id, nome: 'Pets', tipo: 'Despesa', limiteMensal: 0 });
  const receita = api(e, 'POST', '/api/categorias', { nome: 'Aluguel recebido', tipo: 'Receita' });
  assert.equal(receita.limiteMensal, null);

  api(e, 'PUT', '/api/orcamento', [{ categoriaId: despesa.id, limite: 120 }]);
  api(e, 'PUT', `/api/categorias/${despesa.id}`, { nome: 'Animais', tipo: 'Despesa' });
  assert.equal(e.categorias.find((c) => c.id === despesa.id).limiteCentavos, 12000, 'renomear preserva o limite');

  falha(() => api(e, 'PUT', `/api/categorias/${despesa.id}`, { nome: 'Moradia', tipo: 'Despesa' }), 409);
  falha(() => api(e, 'PUT', '/api/categorias/999', { nome: 'Qualquer', tipo: 'Despesa' }), 404);
});

test('categorias: não troca o tipo nem exclui quando há lançamentos', () => {
  const e = criarEstadoInicial();
  const alim = idCategoria(e, 'Alimentação');
  api(e, 'POST', '/api/lancamentos', lanc(e));
  falha(() => api(e, 'PUT', `/api/categorias/${alim}`, { nome: 'Alimentação', tipo: 'Receita' }), 409,
    'Não é possível mudar o tipo de uma categoria que já possui lançamentos.');
  falha(() => api(e, 'DELETE', `/api/categorias/${alim}`), 409, 'Esta categoria possui lançamentos e não pode ser excluída.');

  const livre = idCategoria(e, 'Viagem');
  api(e, 'PUT', `/api/categorias/${livre}`, { nome: 'Viagem', tipo: 'Receita' }); // sem lançamentos, pode
  assert.equal(e.categorias.find((c) => c.id === livre).limiteCentavos, null, 'receita não tem limite');
  api(e, 'DELETE', `/api/categorias/${livre}`);
  assert.ok(!e.categorias.some((c) => c.id === livre));
});

test('contas: CRUD com as mesmas regras e mensagens', () => {
  const e = criarEstadoInicial();
  assert.deepEqual(api(e, 'GET', '/api/contas').map((c) => c.nome),
    ['Cartão de crédito', 'Conta corrente', 'Dinheiro', 'Outro', 'Poupança/Investimentos']);

  falha(() => api(e, 'POST', '/api/contas', { nome: 'DINHEIRO' }), 409, 'Já existe uma conta com esse nome.');
  const nova = api(e, 'POST', '/api/contas', { nome: 'Nubank' });
  assert.deepEqual(nova, { id: nova.id, nome: 'Nubank', cartao: null });
  api(e, 'PUT', `/api/contas/${nova.id}`, { nome: 'Nubank Roxinho' });
  assert.equal(api(e, 'GET', '/api/contas').some((c) => c.nome === 'Nubank Roxinho'), true);

  api(e, 'POST', '/api/lancamentos', lanc(e, { contaId: nova.id }));
  falha(() => api(e, 'DELETE', `/api/contas/${nova.id}`), 409, 'Esta conta possui lançamentos e não pode ser excluída.');
  const livre = idConta(e, 'Outro');
  api(e, 'DELETE', `/api/contas/${livre}`);
  falha(() => api(e, 'DELETE', `/api/contas/${livre}`), 404);
});

test('ids nunca são reaproveitados depois de excluir', () => {
  const e = criarEstadoInicial();
  const primeiro = api(e, 'POST', '/api/lancamentos', lanc(e));
  api(e, 'DELETE', `/api/lancamentos/${primeiro.id}`);
  const segundo = api(e, 'POST', '/api/lancamentos', lanc(e));
  assert.ok(segundo.id > primeiro.id);
});

test('rotas desconhecidas devolvem 404 como a API', () => {
  const e = criarEstadoInicial();
  falha(() => api(e, 'GET', '/api/nada'), 404, 'Recurso não encontrado.');
  falha(() => api(e, 'GET', '/api/lancamentos/abc'), 404, 'Recurso não encontrado.');
  falha(() => api(e, 'DELETE', '/api/resumo'), 404);
  falha(() => api(e, 'GET', '/outra/coisa'), 404);
});

test('alterou: leituras não pedem gravação; escritas pedem', () => {
  const e = criarEstadoInicial();
  assert.equal(rotear(e, 'GET', '/api/categorias', null, { hoje: HOJE }).alterou, false);
  assert.equal(rotear(e, 'GET', '/api/resumo?mes=2026-11', null, { hoje: HOJE }).alterou, false);
  assert.equal(rotear(e, 'POST', '/api/lancamentos', lanc(e), { hoje: HOJE }).alterou, true);
});

test('backup: ida e volta preserva tudo; arquivos adulterados são recusados', () => {
  const e = criarEstadoInicial();
  api(e, 'POST', '/api/lancamentos', lanc(e, { valor: 12.34 }));
  api(e, 'PUT', '/api/orcamento', [{ categoriaId: idCategoria(e, 'Lazer'), limite: 250 }]);

  const texto = montarBackup(e, '2026-11-15T12:00:00.000Z');
  assert.deepEqual(lerBackup(texto), validarEstado(e));
  assert.deepEqual(lerBackup(texto).lancamentos.map((l) => l.valorCentavos), [1234]);

  falha(() => lerBackup('isto não é json'), 400, 'Backup inválido: o arquivo não é um JSON válido.');
  falha(() => lerBackup('{"foo":1}'), 400, 'Backup inválido: este arquivo não foi gerado pelo Controle Financeiro.');

  const adulterar = (fn) => {
    const o = JSON.parse(texto);
    fn(o.dados);
    return JSON.stringify(o);
  };
  falha(() => lerBackup(adulterar((d) => { d.versao = 99; })), 400);
  falha(() => lerBackup(adulterar((d) => { d.lancamentos[0].categoriaId = 4242; })), 400);
  falha(() => lerBackup(adulterar((d) => { d.lancamentos[0].valorCentavos = -5; })), 400);
  falha(() => lerBackup(adulterar((d) => { d.lancamentos[0].data = '2026-02-30'; })), 400);
  falha(() => lerBackup(adulterar((d) => { d.lancamentos[0].tipo = 'Receita'; })), 400); // categoria é de despesa
  falha(() => lerBackup(adulterar((d) => { d.categorias[1].id = d.categorias[0].id; })), 400);
  falha(() => lerBackup(adulterar((d) => { delete d.contas; })), 400);
});

test('backup: contadores nunca ficam atrás dos ids existentes', () => {
  const e = criarEstadoInicial();
  api(e, 'POST', '/api/lancamentos', lanc(e));
  const o = JSON.parse(montarBackup(e));
  o.dados.seq.lancamento = 0; // contador "esquecido"
  const lido = lerBackup(JSON.stringify(o));
  assert.equal(lido.seq.lancamento, 1);
  const novo = api(lido, 'POST', '/api/lancamentos', lanc(lido));
  assert.equal(novo.id, 2, 'não pode repetir o id 1');
});

test('hojeISO usa a data local', () => {
  assert.equal(hojeISO(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assert.equal(hojeISO(new Date(2026, 11, 31, 0, 0)), '2026-12-31');
});


// =====================================================================================
// Despesas fixas
// =====================================================================================

const criar = (e, extra) => api(e, 'POST', '/api/lancamentos', lanc(e, extra)).id;
const obter = (e, id, mes = '2026-11') => api(e, 'GET', `/api/lancamentos?mes=${mes}`).find((l) => l.id === id);

test('fixa: nasce falsa, pode ser criada como fixa e aparece na listagem', () => {
  const e = criarEstadoInicial();
  const a = criar(e, { descricao: 'Aluguel', fixa: true });
  const b = criar(e, { descricao: 'Mercado' });
  assert.equal(obter(e, a).fixa, true);
  assert.equal(obter(e, b).fixa, false);
});

test('fixa: receitas também podem ser fixas; valor precisa ser booleano', () => {
  const e = criarEstadoInicial();
  const receita = { tipo: 'Receita', categoriaId: idCategoria(e, 'Salário'), descricao: 'Salário' };
  const fixa = criar(e, { ...receita, fixa: true });
  const variavel = criar(e, { ...receita, descricao: 'Bônus', fixa: false });
  assert.equal(obter(e, fixa).fixa, true);
  assert.equal(obter(e, variavel).fixa, false);
  falha(() => criar(e, { fixa: 'sim' }), 400, 'Valor inválido para lançamento fixo.');
  falha(() => criar(e, { ...receita, fixa: 1 }), 400, 'Valor inválido para lançamento fixo.');
});

test('fixa: editar sem mandar o campo preserva; mandar muda; trocar o tipo mantém', () => {
  const e = criarEstadoInicial();
  const id = criar(e, { fixa: true });
  const { fixa, ...semFixa } = lanc(e, { valor: 77 });
  api(e, 'PUT', `/api/lancamentos/${id}`, semFixa); // cliente antigo, que não conhece "fixa"
  assert.equal(obter(e, id).fixa, true);
  assert.equal(obter(e, id).valor, 77);

  api(e, 'PUT', `/api/lancamentos/${id}`, lanc(e, { fixa: false }));
  assert.equal(obter(e, id).fixa, false);

  api(e, 'PUT', `/api/lancamentos/${id}`, lanc(e, { fixa: true }));
  const { fixa: _f, ...comoReceita } = lanc(e, { tipo: 'Receita', categoriaId: idCategoria(e, 'Salário') });
  api(e, 'PUT', `/api/lancamentos/${id}`, comoReceita);
  assert.equal(obter(e, id).tipo, 'Receita');
  assert.equal(obter(e, id).fixa, true);
});

test('fixa: PATCH alterna (despesa e receita), valida e respeita ids inexistentes', () => {
  const e = criarEstadoInicial();
  const id = criar(e);
  api(e, 'PATCH', `/api/lancamentos/${id}/fixa`, { fixa: true });
  assert.equal(obter(e, id).fixa, true);
  api(e, 'PATCH', `/api/lancamentos/${id}/fixa`, { fixa: false });
  assert.equal(obter(e, id).fixa, false);

  falha(() => api(e, 'PATCH', `/api/lancamentos/${id}/fixa`, {}), 400, 'Informe se o lançamento é fixo (true ou false).');
  falha(() => api(e, 'PATCH', `/api/lancamentos/${id}/fixa`, { fixa: 'true' }), 400);
  falha(() => api(e, 'PATCH', '/api/lancamentos/999/fixa', { fixa: true }), 404, 'Registro não encontrado.');

  const rec = criar(e, { tipo: 'Receita', categoriaId: idCategoria(e, 'Salário'), descricao: 'Salário' });
  api(e, 'PATCH', `/api/lancamentos/${rec}/fixa`, { fixa: true });
  assert.equal(obter(e, rec).fixa, true);
  api(e, 'PATCH', `/api/lancamentos/${rec}/fixa`, { fixa: false });
  assert.equal(obter(e, rec).fixa, false);
});

test('fixa: filtro da listagem (true/false) e valor inválido', () => {
  const e = criarEstadoInicial();
  criar(e, { descricao: 'Aluguel', fixa: true });
  criar(e, { descricao: 'Mercado' });
  const nomes = (q) => api(e, 'GET', `/api/lancamentos?mes=2026-11&${q}`).map((l) => l.descricao);
  assert.deepEqual(nomes('fixa=true'), ['Aluguel']);
  assert.deepEqual(nomes('fixa=false'), ['Mercado']);
  assert.equal(nomes('').length, 2);
  falha(() => nomes('fixa=talvez'), 400, 'Valor de "fixa" inválido. Use true ou false.');
});

test('somarMeses e diasNoMes: viradas de ano e anos bissextos', () => {
  assert.equal(somarMeses('2026-01', -1), '2025-12');
  assert.equal(somarMeses('2026-12', 1), '2027-01');
  assert.equal(somarMeses('2026-03', -15), '2024-12');
  assert.equal(somarMeses('2026-06', 0), '2026-06');
  assert.equal(diasNoMes('2026-02'), 28);
  assert.equal(diasNoMes('2028-02'), 29);
  assert.equal(diasNoMes('2026-04'), 30);
  assert.equal(diasNoMes('2026-12'), 31);
});

// ---------- Copiar fixas ----------

const copiar = (e, corpo) => api(e, 'POST', '/api/despesas-fixas/copiar', corpo);

test('copiar fixas: cria receitas e despesas fixas no mês seguinte, pendentes, mesmo dia; ignora as variáveis', () => {
  const e = criarEstadoInicial();
  criar(e, { descricao: 'Aluguel', data: '2026-10-05', valor: 1500, fixa: true });
  criar(e, { descricao: 'Internet', data: '2026-10-20', valor: 99.9, fixa: true, status: 'Pendente' });
  criar(e, { descricao: 'Mercado', data: '2026-10-12', valor: 300 }); // variável: não copia
  criar(e, { descricao: 'Salário', data: '2026-10-06', valor: 5000, tipo: 'Receita', categoriaId: idCategoria(e, 'Salário'), fixa: true });
  criar(e, { descricao: 'Freela', data: '2026-10-07', tipo: 'Receita', categoriaId: idCategoria(e, 'Freelance') }); // variável

  const r = copiar(e, { mes: '2026-11' });
  assert.deepEqual(r, {
    mes: '2026-11', origem: '2026-10', encontradas: 3, criadas: 3, ignoradas: 0, receitasCriadas: 1, despesasCriadas: 2,
  });

  const nov = api(e, 'GET', '/api/lancamentos?mes=2026-11').sort((a, b) => a.data.localeCompare(b.data));
  assert.deepEqual(nov.map((l) => [l.descricao, l.data, l.valor, l.status, l.fixa, l.tipo, l.categoria]), [
    ['Aluguel', '2026-11-05', 1500, 'Pendente', true, 'Despesa', 'Alimentação'],
    ['Salário', '2026-11-06', 5000, 'Pendente', true, 'Receita', 'Salário'],
    ['Internet', '2026-11-20', 99.9, 'Pendente', true, 'Despesa', 'Alimentação'],
  ]);
  // o mês de origem não muda
  assert.equal(api(e, 'GET', '/api/lancamentos?mes=2026-10').length, 5);
});

test('copiar fixas: não duplica ao repetir a ação, nem o que já existe no mês', () => {
  const e = criarEstadoInicial();
  criar(e, { descricao: 'Aluguel', data: '2026-10-05', fixa: true });
  criar(e, { descricao: 'Internet', data: '2026-10-20', fixa: true });
  criar(e, { descricao: '  aluguel ', data: '2026-11-03', fixa: false, valor: 1 }); // já existe (outra caixa/espaços)

  const primeira = copiar(e, { mes: '2026-11' });
  assert.equal(primeira.criadas, 1);
  assert.equal(primeira.ignoradas, 1);
  const segunda = copiar(e, { mes: '2026-11' });
  assert.equal(segunda.criadas, 0);
  assert.equal(segunda.ignoradas, 2);
  assert.equal(api(e, 'GET', '/api/lancamentos?mes=2026-11').length, 2);
});

test('copiar fixas: despesas repetidas na origem são todas copiadas (conta por quantidade)', () => {
  const e = criarEstadoInicial();
  criar(e, { descricao: 'Streaming', data: '2026-10-05', valor: 40, fixa: true });
  criar(e, { descricao: 'Streaming', data: '2026-10-06', valor: 40, fixa: true });
  assert.equal(copiar(e, { mes: '2026-11' }).criadas, 2);
  assert.equal(copiar(e, { mes: '2026-11' }).criadas, 0);
});

test('copiar fixas: dia 31 vira o último dia do mês menor; virada de ano; origem explícita', () => {
  const e = criarEstadoInicial();
  criar(e, { descricao: 'Condomínio', data: '2026-01-31', fixa: true });
  const fev = copiar(e, { mes: '2026-02' });
  assert.equal(fev.criadas, 1);
  assert.equal(api(e, 'GET', '/api/lancamentos?mes=2026-02')[0].data, '2026-02-28');

  criar(e, { descricao: 'Seguro', data: '2025-12-15', fixa: true });
  assert.equal(copiar(e, { mes: '2026-01' }).origem, '2025-12');

  // origem explícita (pula meses)
  const r = copiar(e, { mes: '2026-06', origem: '2026-01' });
  assert.equal(r.origem, '2026-01');
  assert.equal(api(e, 'GET', '/api/lancamentos?mes=2026-06')[0].data, '2026-06-30');
});

test('copiar fixas: sem fixas na origem, mês igual e mês inválido', () => {
  const e = criarEstadoInicial();
  criar(e, { descricao: 'Mercado', data: '2026-10-12' });
  const r = rotear(e, 'POST', '/api/despesas-fixas/copiar', { mes: '2026-11' }, { hoje: HOJE });
  assert.deepEqual(r.corpo, {
    mes: '2026-11', origem: '2026-10', encontradas: 0, criadas: 0, ignoradas: 0, receitasCriadas: 0, despesasCriadas: 0,
  });
  assert.equal(r.alterou, false, 'nada criado = nada a gravar');

  falha(() => copiar(e, { mes: '2026-11', origem: '2026-11' }), 400, 'O mês de origem deve ser diferente do mês de destino.');
  falha(() => copiar(e, { mes: '2026-13' }), 400, 'Mês inválido. Use o formato AAAA-MM.');
  falha(() => copiar(e, { mes: '2026-11', origem: 'abc' }), 400, 'Mês inválido. Use o formato AAAA-MM.');
  falha(() => api(e, 'GET', '/api/despesas-fixas/copiar'), 404);
  falha(() => api(e, 'POST', '/api/despesas-fixas/outra'), 404);
});

test('copiar fixas: sem corpo usa o mês atual; ids continuam únicos', () => {
  const e = criarEstadoInicial();
  criar(e, { descricao: 'Aluguel', data: '2026-10-05', fixa: true });
  const r = copiar(e, undefined); // HOJE = 2026-11-15
  assert.equal(r.mes, '2026-11');
  const ids = e.lancamentos.map((l) => l.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(e.seq.lancamento, Math.max(...ids));
});

// ---------- Painel ----------

const painelDe = (e, mes = '2026-11', hoje = HOJE) => rotear(e, 'GET', `/api/dashboard?mes=${mes}`, undefined, { hoje }).corpo;

function cenario() {
  const e = criarEstadoInicial();
  const alim = idCategoria(e, 'Alimentação');
  const mor = idCategoria(e, 'Moradia');
  const laz = idCategoria(e, 'Lazer');
  api(e, 'PUT', '/api/orcamento', [
    { categoriaId: alim, limite: 500 }, { categoriaId: mor, limite: 2000 }, { categoriaId: laz, limite: 100 },
  ]);
  // novembro/2026
  criar(e, { descricao: 'Aluguel', data: '2026-11-05', valor: 1600, categoriaId: mor, fixa: true }); // 80% de 2000 => alerta
  criar(e, { descricao: 'Mercado', data: '2026-11-08', valor: 300, categoriaId: alim });            // 60% => ok
  criar(e, { descricao: 'Cinema', data: '2026-11-09', valor: 150, categoriaId: laz });              // 150% => estourado
  criar(e, { descricao: 'Internet', data: '2026-11-25', valor: 100, categoriaId: idCategoria(e, 'Contas e impostos'), fixa: true, status: 'Pendente' });
  criar(e, { descricao: 'Remédio', data: '2026-11-10', valor: 50, categoriaId: idCategoria(e, 'Saúde') }); // sem limite
  criar(e, { descricao: 'Salário', data: '2026-11-05', valor: 5000, tipo: 'Receita', categoriaId: idCategoria(e, 'Salário') });
  criar(e, { descricao: 'Freela', data: '2026-11-20', valor: 700, tipo: 'Receita', categoriaId: idCategoria(e, 'Freelance'), status: 'Pendente' });
  // outubro/2026 (mês anterior)
  criar(e, { descricao: 'Aluguel', data: '2026-10-05', valor: 1600, categoriaId: mor, fixa: true });
  criar(e, { descricao: 'Mercado', data: '2026-10-08', valor: 400, categoriaId: alim });
  criar(e, { descricao: 'Salário', data: '2026-10-05', valor: 4800, tipo: 'Receita', categoriaId: idCategoria(e, 'Salário') });
  return e;
}

test('painel: totais de despesas, receitas, fixas e variáveis', () => {
  const p = painelDe(cenario());
  assert.equal(p.mes, '2026-11');
  assert.deepEqual(p.despesas, { pagas: 2100, pendentes: 100, total: 2200, quantidade: 5 });
  assert.deepEqual(p.receitas, { pagas: 5000, pendentes: 700, total: 5700, quantidade: 2 });
  assert.equal(p.saldoRealizado, 2900);
  assert.deepEqual({ ...p.fixas, itens: undefined }, { pagas: 1600, pendentes: 100, total: 1700, quantidade: 2, itens: undefined });
  assert.deepEqual(p.variaveis, { pagas: 500, pendentes: 0, total: 500, quantidade: 3 });
  assert.equal(p.percentualFixas, 77.3); // 1700 / 2200
  assert.deepEqual(p.fixas.itens.map((i) => [i.descricao, i.data, i.valor, i.status]), [
    ['Aluguel', '2026-11-05', 1600, 'PagoRecebido'],
    ['Internet', '2026-11-25', 100, 'Pendente'],
  ]);
});

test('painel: orçamento total, situação por categoria e ordem (pior primeiro)', () => {
  const o = painelDe(cenario()).orcamento;
  assert.equal(o.limiteTotal, 2600);
  assert.equal(o.realizado, 2050); // só categorias COM limite: 1600 + 300 + 150
  assert.equal(o.disponivel, 550);
  assert.equal(o.percentual, 78.8);
  assert.equal(o.semLimiteRealizado, 50);
  assert.equal(o.categoriasComLimite, 3);
  assert.equal(o.emAlerta, 1);
  assert.equal(o.estouradas, 1);
  assert.deepEqual(o.categorias.map((c) => [c.categoria, c.situacao, c.percentual]), [
    ['Lazer', 'estourado', 150],
    ['Moradia', 'alerta', 80],
    ['Alimentação', 'ok', 60],
    ['Saúde', 'semLimite', 0],
    ['Contas e impostos', 'semLimite', 0], // só tem despesa pendente: aparece, mas sem realizado
  ]);
  const moradia = o.categorias.find((c) => c.categoria === 'Moradia');
  assert.deepEqual([moradia.limite, moradia.realizado, moradia.disponivel], [2000, 1600, 400]);
  assert.equal(o.categorias.find((c) => c.categoria === 'Contas e impostos').pendente, 100);
});

test('painel: limites exatos nos cortes (80% é alerta, 100% é ok, acima é estourado)', () => {
  const e = criarEstadoInicial();
  const cat = idCategoria(e, 'Lazer');
  api(e, 'PUT', '/api/orcamento', [{ categoriaId: cat, limite: 100 }]);
  const situacao = (valor) => {
    const x = criarEstadoInicial();
    api(x, 'PUT', '/api/orcamento', [{ categoriaId: idCategoria(x, 'Lazer'), limite: 100 }]);
    criar(x, { categoriaId: idCategoria(x, 'Lazer'), valor });
    return painelDe(x).orcamento.categorias[0].situacao;
  };
  assert.equal(situacao(79.99), 'ok');
  assert.equal(situacao(80), 'alerta');
  assert.equal(situacao(100), 'alerta');
  assert.equal(situacao(100.01), 'estourado');
});

test('painel: comparação com o mês anterior', () => {
  const c = painelDe(cenario()).comparativo;
  assert.equal(c.despesasPagasMesAnterior, 2000);
  assert.equal(c.receitasRecebidasMesAnterior, 4800);
  assert.equal(c.variacaoDespesas, 5); // 2100 vs 2000
  // sem base de comparação: null (não divide por zero)
  assert.equal(painelDe(cenario(), '2026-01').comparativo.variacaoDespesas, null);
});

test('painel: comparação atravessa a virada de ano', () => {
  const e = criarEstadoInicial();
  criar(e, { data: '2025-12-20', valor: 200 });
  criar(e, { data: '2026-01-10', valor: 100 });
  const c = painelDe(e, '2026-01', '2026-01-31').comparativo;
  assert.equal(c.despesasPagasMesAnterior, 200);
  assert.equal(c.variacaoDespesas, -50);
});

test('painel: ritmo e projeção só no mês em andamento', () => {
  const atual = painelDe(cenario()).ritmo; // hoje = 15/11, 2100 pagos
  assert.deepEqual(atual, { diasDecorridos: 15, diasNoMes: 30, mediaDiaria: 140, projecaoDespesas: 4200 });

  const passado = painelDe(cenario(), '2026-10').ritmo; // mês fechado: divide pelo mês inteiro, sem projeção
  assert.equal(passado.diasDecorridos, 31);
  assert.equal(passado.projecaoDespesas, null);
  assert.equal(passado.mediaDiaria, 64.52); // 2000 / 31

  const futuro = painelDe(cenario(), '2027-03').ritmo;
  assert.deepEqual(futuro, { diasDecorridos: 0, diasNoMes: 31, mediaDiaria: 0, projecaoDespesas: null });
});

test('painel: evolução tem 6 meses terminando no mês pedido, com realizado de receitas e despesas', () => {
  const ev = painelDe(cenario()).evolucao;
  assert.deepEqual(ev.map((x) => x.mes), ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
  assert.deepEqual(ev.at(-1), { mes: '2026-11', receitas: 5000, despesas: 2100 }); // pendentes não contam
  assert.deepEqual(ev.at(-2), { mes: '2026-10', receitas: 4800, despesas: 2000 });
  assert.deepEqual(ev[0], { mes: '2026-06', receitas: 0, despesas: 0 });
  assert.deepEqual(painelDe(cenario(), '2026-02').evolucao.map((x) => x.mes), ['2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02']);
});

test('painel: maiores despesas (até 5, valor decrescente, inclui pendentes e marca as fixas)', () => {
  const m = painelDe(cenario()).maioresDespesas;
  assert.deepEqual(m.map((x) => [x.descricao, x.valor, x.fixa]), [
    ['Aluguel', 1600, true], ['Mercado', 300, false], ['Cinema', 150, false], ['Internet', 100, true], ['Remédio', 50, false],
  ]);
  const e = cenario();
  criar(e, { descricao: 'Extra', valor: 10 });
  assert.equal(painelDe(e).maioresDespesas.length, 5);
});

test('painel: mês vazio, mês inválido, método errado e padrão = mês atual', () => {
  const e = criarEstadoInicial();
  const p = painelDe(e);
  assert.deepEqual(p.despesas, { pagas: 0, pendentes: 0, total: 0, quantidade: 0 });
  assert.equal(p.percentualFixas, 0);
  assert.equal(p.orcamento.percentual, 0);
  assert.equal(p.orcamento.limiteTotal, 0);
  assert.deepEqual(p.orcamento.categorias, []);
  assert.deepEqual(p.maioresDespesas, []);
  assert.equal(p.evolucao.length, 6);

  falha(() => painelDe(e, '2026-13'), 400, 'Mês inválido. Use o formato AAAA-MM.');
  falha(() => api(e, 'POST', '/api/dashboard', {}), 404);
  assert.equal(rotear(e, 'GET', '/api/dashboard', undefined, { hoje: HOJE }).corpo.mes, '2026-11');
  assert.equal(rotear(e, 'GET', '/api/dashboard', undefined, { hoje: HOJE }).alterou, false);
});

test('painel: valores em centavos exatos (sem erro de ponto flutuante)', () => {
  const e = criarEstadoInicial();
  criar(e, { valor: 0.1 });
  criar(e, { valor: 0.2 });
  assert.equal(painelDe(e).despesas.pagas, 0.3);
});

// ---------- Compatibilidade com dados e backups antigos ----------

test('dados antigos sem o campo "fixa" continuam válidos e contam como não fixa', () => {
  const e = criarEstadoInicial();
  criar(e, { descricao: 'Mercado' });
  const antigo = JSON.parse(JSON.stringify(e));
  for (const l of antigo.lancamentos) delete l.fixa; // como era na versão anterior
  const lido = validarEstado(antigo);
  assert.equal(lido.lancamentos[0].fixa, false);

  const viaBackup = lerBackup(JSON.stringify({ app: 'controle-financeiro', exportadoEm: 'x', dados: antigo }));
  assert.equal(viaBackup.lancamentos[0].fixa, false);
  assert.equal(obter(viaBackup, viaBackup.lancamentos[0].id).fixa, false);
});

test('backup preserva "fixa" de despesas e receitas; valor que não é booleano vira não fixo', () => {
  const e = criarEstadoInicial();
  const id = criar(e, { descricao: 'Aluguel', fixa: true });
  const rec = criar(e, { tipo: 'Receita', categoriaId: idCategoria(e, 'Salário'), descricao: 'Salário', fixa: true });
  const volta = lerBackup(montarBackup(e));
  assert.equal(volta.lancamentos.find((l) => l.id === id).fixa, true);
  assert.equal(volta.lancamentos.find((l) => l.id === rec).fixa, true);

  const adulterado = JSON.parse(montarBackup(e));
  adulterado.dados.lancamentos.find((l) => l.id === rec).fixa = 'sim';
  assert.equal(lerBackup(JSON.stringify(adulterado)).lancamentos.find((l) => l.id === rec).fixa, false);
});


// =====================================================================================
// Receitas fixas
// =====================================================================================

const receitaFixa = (e, extra) =>
  criar(e, { tipo: 'Receita', categoriaId: idCategoria(e, 'Salário'), descricao: 'Salário', fixa: true, ...extra });

test('receitas fixas: filtro "só fixas" traz receitas e despesas fixas', () => {
  const e = criarEstadoInicial();
  criar(e, { descricao: 'Aluguel', fixa: true });
  criar(e, { descricao: 'Mercado' });
  receitaFixa(e);
  criar(e, { tipo: 'Receita', categoriaId: idCategoria(e, 'Freelance'), descricao: 'Freela' });
  const nomes = (q) => api(e, 'GET', `/api/lancamentos?mes=2026-11&${q}`).map((l) => l.descricao).sort();
  assert.deepEqual(nomes('fixa=true'), ['Aluguel', 'Salário']);
  assert.deepEqual(nomes('fixa=true&tipo=Receita'), ['Salário']);
  assert.deepEqual(nomes('fixa=false'), ['Freela', 'Mercado']);
});

test('receitas fixas: copiar não confunde receita e despesa com a mesma descrição', () => {
  const e = criarEstadoInicial();
  const cat = idCategoria(e, 'Investimentos');
  // mesma descrição e conta, tipos diferentes
  receitaFixa(e, { descricao: 'Aluguel', categoriaId: cat, data: '2026-10-10' });
  criar(e, { descricao: 'Aluguel', data: '2026-10-05', fixa: true });
  // no destino já existe a DESPESA "Aluguel": só ela é ignorada; a receita é criada
  criar(e, { descricao: 'Aluguel', data: '2026-11-05' });
  const r = copiar(e, { mes: '2026-11' });
  assert.equal(r.criadas, 1);
  assert.equal(r.ignoradas, 1);
  assert.equal(r.receitasCriadas, 1);
  assert.equal(r.despesasCriadas, 0);
  const receitasNov = api(e, 'GET', '/api/lancamentos?mes=2026-11&tipo=Receita');
  assert.deepEqual(receitasNov.map((l) => [l.descricao, l.data, l.status, l.fixa]), [['Aluguel', '2026-11-10', 'Pendente', true]]);
  assert.equal(copiar(e, { mes: '2026-11' }).criadas, 0, 'repetir não duplica');
});

test('receitas fixas: novo endereço /api/lancamentos-fixos/copiar faz o mesmo que o antigo', () => {
  const e = criarEstadoInicial();
  receitaFixa(e, { data: '2026-10-05' });
  const r = api(e, 'POST', '/api/lancamentos-fixos/copiar', { mes: '2026-11' });
  assert.equal(r.receitasCriadas, 1);
  falha(() => api(e, 'POST', '/api/lancamentos-fixos/outra'), 404);
});

test('painel: receitas fixas, saldo fixo e comprometimento', () => {
  const e = cenario(); // despesas fixas em nov: Aluguel 1600 (pago) + Internet 100 (pendente)
  receitaFixa(e, { descricao: 'Salário fixo', valor: 4000, data: '2026-11-05' });
  receitaFixa(e, { descricao: 'Aluguel recebido', valor: 1000, data: '2026-11-10', categoriaId: idCategoria(e, 'Investimentos'), status: 'Pendente' });
  const p = painelDe(e);
  assert.deepEqual({ ...p.receitasFixas, itens: undefined }, { pagas: 4000, pendentes: 1000, total: 5000, quantidade: 2, itens: undefined });
  assert.deepEqual(p.receitasFixas.itens.map((i) => [i.descricao, i.valor, i.status]), [
    ['Salário fixo', 4000, 'PagoRecebido'], ['Aluguel recebido', 1000, 'Pendente'],
  ]);
  assert.equal(p.saldoFixo, 3300); // 5000 - 1700
  assert.equal(p.comprometimentoFixo, 34); // 1700 / 5000
  // receitas fixas não entram nas métricas de despesas
  assert.equal(p.fixas.total, 1700);
  assert.equal(p.percentualFixas, 77.3);
});

test('painel: sem receitas fixas, comprometimento é null (não divide por zero)', () => {
  const p = painelDe(cenario());
  assert.equal(p.receitasFixas.total, 0);
  assert.deepEqual(p.receitasFixas.itens, []);
  assert.equal(p.saldoFixo, -1700);
  assert.equal(p.comprometimentoFixo, null);
});
