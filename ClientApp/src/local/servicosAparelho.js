// Serviços que só existem no APK (Android): notificações de vencimento e backup automático.
// No navegador (PWA) tudo aqui vira "não faz nada" — lá os avisos aparecem só dentro do app, no Resumo.
//
// Funciona assim: toda vez que os dados mudam (entrar, salvar, importar), espera um instante (para juntar várias
// gravações seguidas) e então refaz a agenda de notificações e, se estiver na hora, grava o backup automático.
import { Capacitor } from '@capacitor/core';
import { aoMudarDados, requestLocal } from './localApi.js';
import { planejarNotificacoes, reagendar, pedirPermissao } from './notificacoes.js';
import { backupAutomaticoDevido, gravarBackupAutomatico } from './backupAutomatico.js';

export const ehAparelho = () => Capacitor.isNativePlatform();

const notificacoes = () => import('@capacitor/local-notifications').then((m) => m.LocalNotifications);
const arquivos = () => import('@capacitor/filesystem');

let iniciado = false;
let temporizador = null;
let rodando = Promise.resolve();
let ultimoEstado = null;
let ultimoErroBackup = '';

async function processar(estado) {
  try {
    await reagendar(planejarNotificacoes(estado), await notificacoes());
  } catch (e) {
    console.warn('Não foi possível agendar os lembretes', e);
  }

  if (backupAutomaticoDevido(estado)) {
    try {
      const { Filesystem, Directory, Encoding } = await arquivos();
      await gravarBackupAutomatico(estado, { Filesystem, Directory, Encoding });
      ultimoErroBackup = '';
      // Anota a data (isso grava os dados e dispara outra rodada, que já não terá backup a fazer).
      await requestLocal('POST', '/api/backup/registrar', { automatico: true });
    } catch (e) {
      ultimoErroBackup = e?.message || String(e);
      console.warn('Backup automático falhou', e);
    }
  }
}

/** Liga os serviços (uma vez). Chamado ao abrir o app no modo local. */
export function iniciarServicosAparelho() {
  if (iniciado || !ehAparelho()) return;
  iniciado = true;
  aoMudarDados((estado) => {
    ultimoEstado = estado;
    clearTimeout(temporizador);
    temporizador = setTimeout(() => {
      const atual = ultimoEstado;
      rodando = rodando.then(() => processar(atual));
    }, 1500);
  });
}

/** Ao ligar os lembretes: pede permissão ao Android. Devolve true se pode notificar (no navegador, false). */
export async function permitirNotificacoes() {
  if (!ehAparelho()) return false;
  return pedirPermissao(await notificacoes());
}

/** Ao apagar uma conta: remove os lembretes dela que já estavam agendados. */
export async function cancelarNotificacoes() {
  if (!ehAparelho()) return;
  try { await reagendar([], await notificacoes()); } catch { /* nada a fazer */ }
}

/** Para a tela de configurações mostrar se o último backup automático deu erro. */
export const erroBackupAutomatico = () => ultimoErroBackup;
