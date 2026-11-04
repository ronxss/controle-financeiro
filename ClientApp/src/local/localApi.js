// "API" do modo local: atende as mesmas rotas da API em C#, mas dentro do aparelho, para a conta que está logada.
// As requisições são executadas uma de cada vez (fila), para que duas gravações seguidas nunca se atropelem.
import { rotear, ErroLocal } from './engine.js';
import { criarServicoUsuarios } from './usuarios.js';
import { repo } from './armazenamento.js';

export const servico = criarServicoUsuarios(repo);

let sessao = null; // { usuario, chave } — a chave só existe na memória
let estado = null; // dados (já abertos) da conta logada
let fila = Promise.resolve();

// Quem precisa saber quando os dados mudam (agendar lembretes, backup automático). Recebem uma CÓPIA do estado.
const ouvintes = new Set();
/** Registra uma função chamada depois de entrar, de cada gravação e de importar backup. Devolve "cancelar". */
export function aoMudarDados(fn) {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}
function avisarOuvintes() {
  if (!estado || ouvintes.size === 0) return;
  const copia = structuredClone(estado);
  for (const fn of ouvintes) {
    try { fn(copia); } catch (e) { console.warn('Falha ao avisar mudança de dados', e); }
  }
}

function enfileirar(tarefa) {
  const resultado = fila.then(tarefa);
  fila = resultado.catch(() => {}); // um erro não pode travar a fila
  return resultado;
}

const exigirSessao = () => {
  if (!sessao) throw new ErroLocal('Entre na sua conta para continuar.', 401);
};

/** Chamado depois de entrar/criar conta com sucesso. */
export function abrirSessao(nova) {
  sessao = { usuario: nova.usuario, chave: nova.chave };
  estado = nova.estado;
  avisarOuvintes();
}

/** Sair: esquece a chave e os dados da memória. */
export function encerrarSessao() {
  sessao = null;
  estado = null;
}

export const sessaoAtual = () => sessao;
export const estadoEmMemoria = () => estado;

/** Depois de trocar a senha, a chave da sessão muda. */
export function atualizarChave(nova) {
  if (sessao) sessao = { ...sessao, chave: nova.chave };
}

/** Mesmo contrato de api.js: devolve o corpo da resposta ou lança ErroLocal (com .status). */
export function requestLocal(metodo, url, corpo) {
  return enfileirar(async () => {
    exigirSessao();
    const r = rotear(estado, metodo, url, corpo);
    if (r.alterou) {
      try {
        await servico.salvar(sessao, estado);
      } catch (e) {
        // A memória pode ter ficado à frente do disco: volta para o que está gravado.
        try { estado = await servico.carregar(sessao); } catch { /* mantém */ }
        throw e;
      }
      avisarOuvintes();
    }
    return r.corpo;
  });
}

/** Estado atual (para exportar backup). */
export function lerEstadoAtual() {
  return enfileirar(async () => {
    exigirSessao();
    return structuredClone(estado);
  });
}

/** Troca todos os dados da conta logada (importação de backup). Recebe um estado já validado. */
export function substituirEstado(novo) {
  return enfileirar(async () => {
    exigirSessao();
    await servico.salvar(sessao, novo);
    estado = novo;
    avisarOuvintes();
  });
}

export { ErroLocal };
