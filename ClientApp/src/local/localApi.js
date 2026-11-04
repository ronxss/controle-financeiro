// "API" do modo local: atende as mesmas rotas da API em C#, mas dentro do aparelho.
// As requisições são executadas uma de cada vez (fila), para que duas gravações seguidas nunca se atropelem.
import { rotear, ErroLocal } from './engine.js';
import { carregarEstado, salvarEstado } from './armazenamento.js';

let estado = null;
let fila = Promise.resolve();

function enfileirar(tarefa) {
  const resultado = fila.then(tarefa);
  fila = resultado.catch(() => {}); // um erro não pode travar a fila
  return resultado;
}

async function garantirCarregado() {
  if (!estado) estado = await carregarEstado();
}

/** Mesmo contrato de api.js: devolve o corpo da resposta ou lança ErroLocal (com .status). */
export function requestLocal(metodo, url, corpo) {
  return enfileirar(async () => {
    await garantirCarregado();
    const r = rotear(estado, metodo, url, corpo);
    if (r.alterou) {
      try {
        await salvarEstado(estado);
      } catch (e) {
        estado = null; // a memória pode ter ficado à frente do disco: recarrega na próxima chamada
        throw e;
      }
    }
    return r.corpo;
  });
}

/** Estado atual (para exportar backup). */
export function lerEstadoAtual() {
  return enfileirar(async () => {
    await garantirCarregado();
    return structuredClone(estado);
  });
}

/** Troca todos os dados (importação de backup). Recebe um estado já validado. */
export function substituirEstado(novo) {
  return enfileirar(async () => {
    await salvarEstado(novo);
    estado = novo;
  });
}

export { ErroLocal };
