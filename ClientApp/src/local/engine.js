// Motor do modo local.
//
// Reproduz, dentro do aparelho, as regras que a API em C# aplica (Controllers/*.cs): mesmas rotas, mesmas
// validações, mesmas mensagens de erro e mesmo formato de resposta. Assim as telas React funcionam sem
// alteração, falando com o aparelho em vez de um servidor.
//
// Este arquivo é PURO: não acessa navegador, disco nem rede. Recebe o estado e devolve o resultado, o que
// permite testá-lo com `node --test` (veja engine.test.js). O armazenamento fica em armazenamento.js.
//
// Valores em dinheiro são guardados em CENTAVOS (inteiros) para evitar erros de ponto flutuante
// (0,1 + 0,2 != 0,3 em JavaScript) e só viram reais na resposta.

export class ErroLocal extends Error {
  constructor(mensagem, status = 400) {
    super(mensagem);
    this.name = 'ErroLocal';
    this.status = status;
  }
}

export const VERSAO_DADOS = 1;

export const CATEGORIAS_RECEITA = ['Salário', 'Freelance', 'Investimentos'];
export const CATEGORIAS_DESPESA = [
  'Moradia', 'Alimentação', 'Transporte', 'Saúde', 'Educação', 'Lazer',
  'Assinaturas', 'Compras', 'Contas e impostos', 'Viagem', 'Outros',
];
export const CONTAS_PADRAO = ['Conta corrente', 'Dinheiro', 'Cartão de crédito', 'Poupança/Investimentos', 'Outro'];

const TIPOS = ['Receita', 'Despesa'];
const STATUS = ['Pendente', 'PagoRecebido'];
const LIMITE_MAXIMO_CENTAVOS = 99_999_999_999; // 999.999.999,99 (mesmo teto da API)

// ---------- Estado ----------

export function criarEstadoInicial() {
  const estado = { versao: VERSAO_DADOS, seq: { categoria: 0, conta: 0, lancamento: 0 }, categorias: [], contas: [], lancamentos: [] };
  for (const nome of CATEGORIAS_RECEITA) {
    estado.categorias.push({ id: ++estado.seq.categoria, nome, tipo: 'Receita', limiteCentavos: null });
  }
  for (const nome of CATEGORIAS_DESPESA) {
    estado.categorias.push({ id: ++estado.seq.categoria, nome, tipo: 'Despesa', limiteCentavos: 0 });
  }
  for (const nome of CONTAS_PADRAO) estado.contas.push({ id: ++estado.seq.conta, nome });
  return estado;
}

// ---------- Utilidades ----------

const emCentavos = (valor) => Math.round(Number(valor) * 100);
const emReais = (centavos) => centavos / 100;
const mesmoNome = (a, b) => a.toLocaleLowerCase('pt-BR') === b.toLocaleLowerCase('pt-BR');
const porTexto = (a, b) => a.localeCompare(b, 'pt-BR');
const naoEncontrado = () => new ErroLocal('Registro não encontrado.', 404);
const conflito = (msg) => new ErroLocal(msg, 409);

const dois = (n) => String(n).padStart(2, '0');
export function hojeISO(data = new Date()) {
  return `${data.getFullYear()}-${dois(data.getMonth() + 1)}-${dois(data.getDate())}`;
}

/** Data válida no formato aaaa-mm-dd (rejeita 2026-02-31). */
function dataValida(texto) {
  if (typeof texto !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const [a, m, d] = texto.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** "aaaa-mm" (ou vazio = mês atual) -> "aaaa-mm". Mesma regra de Services/Periodo.cs. */
function lerMes(mes, hoje) {
  if (mes === null || mes === undefined || String(mes).trim() === '') return hoje.slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) throw new ErroLocal('Mês inválido. Use o formato AAAA-MM.', 400);
  return mes;
}

const doMes = (estado, mes) => estado.lancamentos.filter((l) => l.data.slice(0, 7) === mes);

function lerId(texto) {
  const id = Number(texto);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function inteiroObrigatorio(valor, mensagem) {
  const n = typeof valor === 'string' && valor.trim() !== '' ? Number(valor) : valor;
  if (!Number.isInteger(n)) throw new ErroLocal(mensagem, 400);
  return n;
}

function enumObrigatorio(valor, validos, ausente, invalido) {
  if (valor === null || valor === undefined || valor === '') throw new ErroLocal(ausente, 400);
  if (!validos.includes(valor)) throw new ErroLocal(invalido, 400);
  return valor;
}

function nomeObrigatorio(corpo) {
  const nome = String(corpo?.nome ?? '').trim();
  if (!nome) throw new ErroLocal('Informe o nome.', 400);
  if (nome.length > 60) throw new ErroLocal('O nome deve ter no máximo 60 caracteres.', 400);
  return nome;
}

// ---------- Mapeamentos (formato das respostas da API) ----------

const dtoCategoria = (c) => ({
  id: c.id, nome: c.nome, tipo: c.tipo, limiteMensal: c.limiteCentavos === null ? null : emReais(c.limiteCentavos),
});

function dtoLancamento(estado, l) {
  const cat = estado.categorias.find((c) => c.id === l.categoriaId);
  const conta = estado.contas.find((c) => c.id === l.contaId);
  return {
    id: l.id, data: l.data, tipo: l.tipo, categoriaId: l.categoriaId, categoria: cat?.nome ?? '',
    descricao: l.descricao, contaId: l.contaId, conta: conta?.nome ?? '', valor: emReais(l.valorCentavos), status: l.status,
  };
}

// ---------- Categorias ----------

function categorias(estado, metodo, id, corpo) {
  if (metodo === 'GET' && id === null) {
    const itens = [...estado.categorias]
      .sort((a, b) => porTexto(a.tipo, b.tipo) || porTexto(a.nome, b.nome))
      .map(dtoCategoria);
    return { status: 200, corpo: itens };
  }

  if (metodo === 'POST' && id === null) {
    const nome = nomeObrigatorio(corpo);
    const tipo = enumObrigatorio(corpo?.tipo, TIPOS, 'Informe o tipo.', 'Tipo inválido.');
    if (estado.categorias.some((c) => mesmoNome(c.nome, nome))) throw conflito('Já existe uma categoria com esse nome.');

    const c = { id: ++estado.seq.categoria, nome, tipo, limiteCentavos: tipo === 'Despesa' ? 0 : null };
    estado.categorias.push(c);
    return { status: 200, corpo: dtoCategoria(c), alterou: true };
  }

  if (metodo === 'PUT' && id !== null) {
    const nome = nomeObrigatorio(corpo);
    const tipo = enumObrigatorio(corpo?.tipo, TIPOS, 'Informe o tipo.', 'Tipo inválido.');
    const c = estado.categorias.find((x) => x.id === id);
    if (!c) throw naoEncontrado();
    if (estado.categorias.some((x) => x.id !== id && mesmoNome(x.nome, nome))) throw conflito('Já existe uma categoria com esse nome.');
    if (c.tipo !== tipo && estado.lancamentos.some((l) => l.categoriaId === id)) {
      throw conflito('Não é possível mudar o tipo de uma categoria que já possui lançamentos.');
    }
    c.nome = nome;
    c.tipo = tipo;
    c.limiteCentavos = tipo === 'Despesa' ? (c.limiteCentavos ?? 0) : null;
    return { status: 204, corpo: null, alterou: true };
  }

  if (metodo === 'DELETE' && id !== null) {
    const c = estado.categorias.find((x) => x.id === id);
    if (!c) throw naoEncontrado();
    if (estado.lancamentos.some((l) => l.categoriaId === id)) throw conflito('Esta categoria possui lançamentos e não pode ser excluída.');
    estado.categorias = estado.categorias.filter((x) => x.id !== id);
    return { status: 204, corpo: null, alterou: true };
  }
  return null;
}

// ---------- Contas ----------

function contas(estado, metodo, id, corpo) {
  if (metodo === 'GET' && id === null) {
    return { status: 200, corpo: [...estado.contas].sort((a, b) => porTexto(a.nome, b.nome)).map((c) => ({ id: c.id, nome: c.nome })) };
  }

  if (metodo === 'POST' && id === null) {
    const nome = nomeObrigatorio(corpo);
    if (estado.contas.some((c) => mesmoNome(c.nome, nome))) throw conflito('Já existe uma conta com esse nome.');
    const c = { id: ++estado.seq.conta, nome };
    estado.contas.push(c);
    return { status: 200, corpo: { id: c.id, nome: c.nome }, alterou: true };
  }

  if (metodo === 'PUT' && id !== null) {
    const nome = nomeObrigatorio(corpo);
    const c = estado.contas.find((x) => x.id === id);
    if (!c) throw naoEncontrado();
    if (estado.contas.some((x) => x.id !== id && mesmoNome(x.nome, nome))) throw conflito('Já existe uma conta com esse nome.');
    c.nome = nome;
    return { status: 204, corpo: null, alterou: true };
  }

  if (metodo === 'DELETE' && id !== null) {
    const c = estado.contas.find((x) => x.id === id);
    if (!c) throw naoEncontrado();
    if (estado.lancamentos.some((l) => l.contaId === id)) throw conflito('Esta conta possui lançamentos e não pode ser excluída.');
    estado.contas = estado.contas.filter((x) => x.id !== id);
    return { status: 204, corpo: null, alterou: true };
  }
  return null;
}

// ---------- Lançamentos ----------

/** Valida o corpo como a API faz (DataAnnotations + ValidarAsync) e devolve os campos já normalizados. */
function lerLancamento(estado, corpo) {
  const c = corpo ?? {};
  if (c.data === null || c.data === undefined || c.data === '') throw new ErroLocal('Informe a data.', 400);
  if (!dataValida(c.data)) throw new ErroLocal('Data inválida.', 400);
  const tipo = enumObrigatorio(c.tipo, TIPOS, 'Informe o tipo.', 'Tipo inválido.');
  const categoriaId = inteiroObrigatorio(c.categoriaId, 'Selecione a categoria.');

  const descricao = String(c.descricao ?? '').trim();
  if (!descricao) throw new ErroLocal('Informe a descrição.', 400);
  if (descricao.length > 200) throw new ErroLocal('A descrição deve ter no máximo 200 caracteres.', 400);

  const contaId = inteiroObrigatorio(c.contaId, 'Selecione a conta.');

  const valor = Number(c.valor);
  const valorCentavos = emCentavos(valor);
  if (!Number.isFinite(valor) || valor < 0.01 || valorCentavos > LIMITE_MAXIMO_CENTAVOS || valorCentavos < 1) {
    throw new ErroLocal('O valor deve ser maior que zero.', 400);
  }
  const status = enumObrigatorio(c.status, STATUS, 'Informe o status.', 'Status inválido.');

  const cat = estado.categorias.find((x) => x.id === categoriaId);
  if (!cat) throw new ErroLocal('Categoria inválida.', 400);
  if (cat.tipo !== tipo) throw new ErroLocal('A categoria selecionada não corresponde ao tipo do lançamento.', 400);
  if (!estado.contas.some((x) => x.id === contaId)) throw new ErroLocal('Conta inválida.', 400);

  return { data: c.data, tipo, categoriaId, descricao, contaId, valorCentavos, status };
}

function lancamentos(estado, metodo, id, corpo, consulta, hoje, subrota) {
  if (metodo === 'GET' && id === null) {
    const mes = lerMes(consulta.get('mes'), hoje);
    let itens = doMes(estado, mes);

    // Os filtros são validados ANTES de filtrar, para que um valor inválido sempre gere erro (mesmo sem itens).
    const tipo = consulta.get('tipo') ? enumObrigatorio(consulta.get('tipo'), TIPOS, '', 'Tipo inválido.') : null;
    const status = consulta.get('status') ? enumObrigatorio(consulta.get('status'), STATUS, '', 'Status inválido.') : null;
    const categoriaId = consulta.get('categoriaId') ? inteiroObrigatorio(consulta.get('categoriaId'), 'categoriaId inválido.') : null;
    const contaId = consulta.get('contaId') ? inteiroObrigatorio(consulta.get('contaId'), 'contaId inválido.') : null;
    if (tipo) itens = itens.filter((l) => l.tipo === tipo);
    if (status) itens = itens.filter((l) => l.status === status);
    if (categoriaId !== null) itens = itens.filter((l) => l.categoriaId === categoriaId);
    if (contaId !== null) itens = itens.filter((l) => l.contaId === contaId);
    const busca = (consulta.get('busca') ?? '').trim();
    if (busca) {
      const termo = busca.toLocaleLowerCase('pt-BR');
      itens = itens.filter((l) => l.descricao.toLocaleLowerCase('pt-BR').includes(termo));
    }

    itens = [...itens].sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : b.id - a.id));
    return { status: 200, corpo: itens.map((l) => dtoLancamento(estado, l)) };
  }

  if (metodo === 'POST' && id === null) {
    const dados = lerLancamento(estado, corpo);
    const l = { id: ++estado.seq.lancamento, ...dados, criadoEm: new Date().toISOString() };
    estado.lancamentos.push(l);
    return { status: 200, corpo: { id: l.id }, alterou: true };
  }

  if (metodo === 'PUT' && id !== null && !subrota) {
    const dados = lerLancamento(estado, corpo);
    const l = estado.lancamentos.find((x) => x.id === id);
    if (!l) throw naoEncontrado();
    Object.assign(l, dados);
    return { status: 204, corpo: null, alterou: true };
  }

  if (metodo === 'PATCH' && id !== null && subrota === 'status') {
    const status = enumObrigatorio(corpo?.status, STATUS, 'Informe o status.', 'Status inválido.');
    const l = estado.lancamentos.find((x) => x.id === id);
    if (!l) throw naoEncontrado();
    l.status = status;
    return { status: 204, corpo: null, alterou: true };
  }

  if (metodo === 'DELETE' && id !== null && !subrota) {
    const l = estado.lancamentos.find((x) => x.id === id);
    if (!l) throw naoEncontrado();
    estado.lancamentos = estado.lancamentos.filter((x) => x.id !== id);
    return { status: 204, corpo: null, alterou: true };
  }
  return null;
}

// ---------- Resumo e Orçamento ----------

/** Total pago, por categoria de despesa, no mês. Realizado = apenas "PagoRecebido". */
function gastosPorCategoria(estado, mes) {
  const gastos = new Map();
  for (const l of doMes(estado, mes)) {
    if (l.tipo === 'Despesa' && l.status === 'PagoRecebido') {
      gastos.set(l.categoriaId, (gastos.get(l.categoriaId) ?? 0) + l.valorCentavos);
    }
  }
  return gastos;
}

function resumo(estado, metodo, consulta, hoje) {
  if (metodo !== 'GET') return null;
  const mes = lerMes(consulta.get('mes'), hoje);
  const itens = doMes(estado, mes);
  const soma = (tipo, status) =>
    itens.filter((l) => l.tipo === tipo && l.status === status).reduce((s, l) => s + l.valorCentavos, 0);

  const recebidas = soma('Receita', 'PagoRecebido');
  const pagas = soma('Despesa', 'PagoRecebido');
  const recPend = soma('Receita', 'Pendente');
  const despPend = soma('Despesa', 'Pendente');

  const gastos = gastosPorCategoria(estado, mes);
  const despesasPorCategoria = estado.categorias
    .filter((c) => c.tipo === 'Despesa')
    .map((c) => ({ categoria: c.nome, realizado: gastos.get(c.id) ?? 0 }))
    .sort((a, b) => b.realizado - a.realizado || porTexto(a.categoria, b.categoria))
    .map((x) => ({ categoria: x.categoria, realizado: emReais(x.realizado) }));

  return {
    status: 200,
    corpo: {
      receitasRecebidas: emReais(recebidas),
      despesasPagas: emReais(pagas),
      saldoRealizado: emReais(recebidas - pagas),
      receitasPendentes: emReais(recPend),
      despesasPendentes: emReais(despPend),
      saldoPrevisto: emReais(recebidas - pagas + recPend - despPend),
      despesasPorCategoria,
    },
  };
}

function orcamento(estado, metodo, corpo, consulta, hoje) {
  if (metodo === 'GET') {
    const mes = lerMes(consulta.get('mes'), hoje);
    const gastos = gastosPorCategoria(estado, mes);
    const corpoResposta = estado.categorias
      .filter((c) => c.tipo === 'Despesa')
      .sort((a, b) => porTexto(a.nome, b.nome))
      .map((c) => {
        const limite = c.limiteCentavos ?? 0;
        const realizado = gastos.get(c.id) ?? 0;
        const percentual = limite === 0 ? 0 : Math.round((realizado / limite) * 1000) / 10;
        return {
          categoriaId: c.id, categoria: c.nome, limite: emReais(limite), realizado: emReais(realizado),
          disponivel: emReais(limite - realizado), percentual,
        };
      });
    return { status: 200, corpo: corpoResposta };
  }

  if (metodo === 'PUT') {
    if (!Array.isArray(corpo)) throw new ErroLocal('Requisição inválida.', 400);
    const novos = corpo.map((l) => {
      const categoriaId = inteiroObrigatorio(l?.categoriaId, 'Informe a categoria.');
      const valor = l.limite === null || l.limite === undefined ? 0 : Number(l.limite);
      const centavos = emCentavos(valor);
      if (!Number.isFinite(valor) || valor < 0 || centavos > LIMITE_MAXIMO_CENTAVOS) {
        throw new ErroLocal('O limite não pode ser negativo.', 400);
      }
      return { categoriaId, centavos };
    });
    // Mesma regra da API: só altera categorias de despesa existentes; ids desconhecidos são ignorados.
    for (const { categoriaId, centavos } of novos) {
      const c = estado.categorias.find((x) => x.id === categoriaId && x.tipo === 'Despesa');
      if (c) c.limiteCentavos = centavos;
    }
    return { status: 204, corpo: null, alterou: true };
  }
  return null;
}

// ---------- Roteador ----------

/**
 * Atende uma "requisição da API" sobre o estado local.
 * Devolve { status, corpo, alterou } ou lança ErroLocal (com .status) quando a API devolveria erro.
 * `alterou` indica se o estado foi modificado e precisa ser salvo.
 */
export function rotear(estado, metodo, url, corpo, { hoje = hojeISO() } = {}) {
  const u = new URL(url, 'http://local');
  const caminho = u.pathname.replace(/\/+$/, '');
  const partes = caminho.split('/').filter(Boolean); // ['api', 'lancamentos', '12', 'status']
  const m = String(metodo).toUpperCase();

  let r = null;
  if (partes[0] === 'api') {
    const recurso = partes[1];
    const idTexto = partes[2];
    const id = idTexto === undefined ? null : lerId(idTexto);
    const idInvalido = idTexto !== undefined && id === null;
    const subrota = partes[3];

    if (!idInvalido && partes.length <= 4) {
      if (recurso === 'categorias' && partes.length <= 3) r = categorias(estado, m, id, corpo);
      else if (recurso === 'contas' && partes.length <= 3) r = contas(estado, m, id, corpo);
      else if (recurso === 'lancamentos') r = lancamentos(estado, m, id, corpo, u.searchParams, hoje, subrota);
      else if (recurso === 'resumo' && partes.length === 2) r = resumo(estado, m, u.searchParams, hoje);
      else if (recurso === 'orcamento' && partes.length === 2) r = orcamento(estado, m, corpo, u.searchParams, hoje);
    }
  }

  if (!r) throw new ErroLocal('Recurso não encontrado.', 404);
  return { status: r.status, corpo: r.corpo ?? null, alterou: Boolean(r.alterou) };
}

// ---------- Backup ----------

/** Confere se um objeto é um estado íntegro (formato, tipos e referências entre as tabelas). */
export function validarEstado(e) {
  const falha = (msg) => { throw new ErroLocal(`Backup inválido: ${msg}`, 400); };
  if (!e || typeof e !== 'object') falha('formato desconhecido.');
  if (e.versao !== VERSAO_DADOS) falha(`versão ${e.versao} não é suportada.`);
  if (!Array.isArray(e.categorias) || !Array.isArray(e.contas) || !Array.isArray(e.lancamentos)) falha('faltam listas de dados.');
  if (!e.seq || [e.seq.categoria, e.seq.conta, e.seq.lancamento].some((n) => !Number.isInteger(n) || n < 0)) falha('contadores ausentes.');

  const ids = (lista, nome) => {
    const set = new Set();
    for (const x of lista) {
      if (!Number.isInteger(x?.id) || x.id <= 0 || set.has(x.id)) falha(`${nome} com identificador inválido ou repetido.`);
      set.add(x.id);
    }
    return set;
  };
  const idsCat = ids(e.categorias, 'categorias');
  const idsConta = ids(e.contas, 'contas');
  ids(e.lancamentos, 'lançamentos');

  for (const c of e.categorias) {
    if (typeof c.nome !== 'string' || !c.nome.trim() || c.nome.length > 60) falha('nome de categoria inválido.');
    if (!TIPOS.includes(c.tipo)) falha('tipo de categoria inválido.');
    if (c.limiteCentavos !== null && (!Number.isInteger(c.limiteCentavos) || c.limiteCentavos < 0)) falha('limite de categoria inválido.');
  }
  for (const c of e.contas) {
    if (typeof c.nome !== 'string' || !c.nome.trim() || c.nome.length > 60) falha('nome de conta inválido.');
  }
  const tipoPorCategoria = new Map(e.categorias.map((c) => [c.id, c.tipo]));
  for (const l of e.lancamentos) {
    if (!dataValida(l.data)) falha('data de lançamento inválida.');
    if (!TIPOS.includes(l.tipo) || !STATUS.includes(l.status)) falha('tipo ou status de lançamento inválido.');
    if (typeof l.descricao !== 'string' || !l.descricao.trim() || l.descricao.length > 200) falha('descrição de lançamento inválida.');
    if (!Number.isInteger(l.valorCentavos) || l.valorCentavos < 1 || l.valorCentavos > LIMITE_MAXIMO_CENTAVOS) falha('valor de lançamento inválido.');
    if (!idsCat.has(l.categoriaId) || !idsConta.has(l.contaId)) falha('lançamento aponta para categoria ou conta inexistente.');
    if (tipoPorCategoria.get(l.categoriaId) !== l.tipo) falha('categoria incompatível com o tipo do lançamento.');
  }

  // Os contadores nunca podem ficar atrás dos identificadores usados (evita reaproveitar ids).
  const maior = (lista) => lista.reduce((m, x) => Math.max(m, x.id), 0);
  return {
    versao: VERSAO_DADOS,
    seq: {
      categoria: Math.max(e.seq.categoria, maior(e.categorias)),
      conta: Math.max(e.seq.conta, maior(e.contas)),
      lancamento: Math.max(e.seq.lancamento, maior(e.lancamentos)),
    },
    categorias: e.categorias.map((c) => ({ id: c.id, nome: c.nome.trim(), tipo: c.tipo, limiteCentavos: c.limiteCentavos })),
    contas: e.contas.map((c) => ({ id: c.id, nome: c.nome.trim() })),
    lancamentos: e.lancamentos.map((l) => ({
      id: l.id, data: l.data, tipo: l.tipo, categoriaId: l.categoriaId, descricao: l.descricao.trim(),
      contaId: l.contaId, valorCentavos: l.valorCentavos, status: l.status, criadoEm: typeof l.criadoEm === 'string' ? l.criadoEm : '',
    })),
  };
}

export const NOME_APP_BACKUP = 'controle-financeiro';

/** Texto JSON do arquivo de backup. */
export function montarBackup(estado, exportadoEm = new Date().toISOString()) {
  return JSON.stringify({ app: NOME_APP_BACKUP, exportadoEm, dados: estado }, null, 2);
}

/** Lê o texto de um arquivo de backup e devolve o estado validado (ou lança ErroLocal). */
export function lerBackup(texto) {
  let objeto;
  try {
    objeto = JSON.parse(texto);
  } catch {
    throw new ErroLocal('Backup inválido: o arquivo não é um JSON válido.', 400);
  }
  if (objeto?.app !== NOME_APP_BACKUP || !objeto.dados) {
    throw new ErroLocal('Backup inválido: este arquivo não foi gerado pelo Controle Financeiro.', 400);
  }
  return validarEstado(objeto.dados);
}
