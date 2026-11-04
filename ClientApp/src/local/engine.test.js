// Testes do motor local. Rodam com: npm test   (usa o test runner nativo do Node, sem dependências).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  criarEstadoInicial, rotear, ErroLocal, montarBackup, lerBackup, validarEstado, hojeISO,
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
  assert.deepEqual(nova, { id: nova.id, nome: 'Nubank' });
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
