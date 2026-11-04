// Contas do modo local, do ponto de vista das telas: criar, entrar, sair, trocar senha, apagar conta.
import {
  servico, abrirSessao, encerrarSessao, sessaoAtual, estadoEmMemoria, atualizarChave,
} from './localApi.js';

const CHAVE_ULTIMO = 'controle-financeiro:ultimo-usuario';

// Formato que o resto do app já espera de "usuario" (o menu mostra nome e e-mail).
const paraTela = (u) => ({ id: u.id, nome: u.nome, email: 'Dados salvos só neste aparelho', temSenha: true });

/** O último usuário que entrou (só o nome, que não é segredo) — para já vir preenchido na tela de login. */
export function ultimoUsuario() {
  try { return localStorage.getItem(CHAVE_ULTIMO) ?? ''; } catch { return ''; }
}
const lembrar = (nome) => { try { localStorage.setItem(CHAVE_ULTIMO, nome); } catch { /* ignora */ } };

export const listarUsuarios = () => servico.listar();
export const temDadosAntigos = () => servico.temLegado();

export async function criarConta(nome, senha) {
  const s = await servico.criar(nome, senha);
  abrirSessao(s);
  lembrar(s.usuario.nome);
  return { usuario: paraTela(s.usuario), adotouLegado: s.adotouLegado };
}

export async function entrar(nome, senha) {
  const s = await servico.entrar(nome, senha);
  abrirSessao(s);
  lembrar(s.usuario.nome);
  return paraTela(s.usuario);
}

export function sair() {
  encerrarSessao();
}

export async function alterarSenha(senhaAtual, novaSenha) {
  const s = sessaoAtual();
  if (!s) throw new Error('Entre na sua conta para continuar.');
  atualizarChave(await servico.alterarSenha(s, senhaAtual, novaSenha, estadoEmMemoria()));
}

export const excluirConta = (nome) => servico.excluir(nome);
