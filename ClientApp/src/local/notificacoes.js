// Planeja as notificações de vencimento (APK). Módulo puro: recebe o estado e devolve a lista do que agendar.
// O agendamento de verdade (plugin Local Notifications) fica em servicosAparelho.js.
//
// Para cada lançamento PENDENTE (receita ou despesa) que ainda não venceu — e, para cartões, para cada FATURA com
// compras pendentes (pela data de vencimento da fatura, não pela data de cada compra):
//   - um aviso `diasAntes` dias antes, na hora escolhida (se diasAntes > 0);
//   - um aviso no próprio dia do vencimento, na mesma hora.
// Só entram horários no futuro, e no máximo `maximo` avisos (os mais próximos), porque o Android limita a quantidade
// de alarmes por app. A lista é refeita toda vez que os dados mudam.

import { vencimentosPendentes } from './engine.js';

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dois = (n) => String(n).padStart(2, '0');
const dataLocal = (d) => `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;

/** Momento local 'aaaa-mm-dd' às `hora`:00, deslocado `deltaDias`. */
function momento(data, hora, deltaDias = 0) {
  const [a, m, d] = data.split('-').map(Number);
  return new Date(a, m - 1, d + deltaDias, hora, 0, 0, 0);
}

function quandoTexto(dias) {
  if (dias === 0) return 'hoje';
  if (dias === 1) return 'amanhã';
  return `em ${dias} dias`;
}

function textos(v, dias, detalhes) {
  const receita = v.tipo === 'Receita';
  const fatura = v.tipo === 'Fatura';
  const quando = quandoTexto(dias);
  if (!detalhes) {
    let titulo = `Você tem uma conta que vence ${quando}`;
    if (receita) titulo = `Você tem uma receita prevista para ${quando}`;
    if (fatura) titulo = `Uma fatura de cartão vence ${quando}`;
    return { titulo, texto: 'Abra o Controle Financeiro para ver.' };
  }
  const valor = moeda.format(v.valorCentavos / 100);
  if (fatura) return { titulo: `${v.descricao} vence ${quando}`, texto: valor };
  const prefixo = receita ? `Receita prevista para ${quando}` : `Vence ${quando}`;
  return { titulo: `${prefixo}: ${v.descricao}`, texto: [valor, v.categoria].filter(Boolean).join(' · ') };
}

/** Número inteiro estável por vencimento (lançamento ou fatura). O Android exige inteiro de 32 bits. */
function idBase(v) {
  if (v.tipo !== 'Fatura') return v.id;
  const [a, m] = v.fatura.split('-').map(Number);
  return 100_000_000 + v.contaId * 1500 + (((a - 2000) * 12 + m) % 1500);
}

/** Devolve [{ id, quando: Date, titulo, texto, lancamentoId }] em ordem de horário. */
export function planejarNotificacoes(estado, { agora = new Date(), maximo = 60 } = {}) {
  const cfg = estado?.config?.lembretes;
  if (!cfg?.ativo) return [];
  const hoje = dataLocal(agora);
  const planos = [];

  for (const v of vencimentosPendentes(estado)) {
    if (v.data < hoje) continue;
    const avisos = [{ dias: 0, quando: momento(v.data, cfg.hora), sufixo: 0 }];
    if (cfg.diasAntes > 0) avisos.push({ dias: cfg.diasAntes, quando: momento(v.data, cfg.hora, -cfg.diasAntes), sufixo: 1 });
    for (const a of avisos) {
      if (a.quando <= agora) continue;
      planos.push({
        id: idBase(v) * 10 + a.sufixo,
        quando: a.quando,
        lancamentoId: v.id,
        ...textos(v, a.dias, cfg.detalhes),
      });
    }
  }
  planos.sort((a, b) => a.quando - b.quando || a.id - b.id);
  return planos.slice(0, maximo);
}

/**
 * Troca todos os avisos agendados pelos de `planos`. `LN` é o plugin LocalNotifications (injetado para teste).
 * Cancela também os que sobraram de antes (lançamento pago, apagado, ou lembretes desligados).
 */
export async function reagendar(planos, LN) {
  const { notifications: pendentes = [] } = await LN.getPending();
  if (pendentes.length) await LN.cancel({ notifications: pendentes.map((n) => ({ id: n.id })) });
  if (planos.length) {
    await LN.schedule({
      notifications: planos.map((p) => ({
        id: p.id, title: p.titulo, body: p.texto,
        schedule: { at: p.quando, allowWhileIdle: true },
        extra: { lancamentoId: p.lancamentoId },
      })),
    });
  }
  return planos.length;
}

/** Pede permissão para notificar (Android 13+ pergunta à pessoa). Devolve true se puder notificar. */
export async function pedirPermissao(LN) {
  let s = await LN.checkPermissions();
  if (s.display !== 'granted' && s.display !== 'denied') s = await LN.requestPermissions();
  return s.display === 'granted';
}
