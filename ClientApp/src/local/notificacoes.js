// Planeja as notificações de vencimento (APK). Módulo puro: recebe o estado e devolve a lista do que agendar.
// O agendamento de verdade (plugin Local Notifications) fica em servicosAparelho.js.
//
// Para cada lançamento PENDENTE (receita ou despesa) que ainda não venceu:
//   - um aviso `diasAntes` dias antes, na hora escolhida (se diasAntes > 0);
//   - um aviso no próprio dia do vencimento, na mesma hora.
// Só entram horários no futuro, e no máximo `maximo` avisos (os mais próximos), porque o Android limita a quantidade
// de alarmes por app. A lista é refeita toda vez que os dados mudam.

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

function textos(l, dias, detalhes, nomeCategoria) {
  const receita = l.tipo === 'Receita';
  const quando = quandoTexto(dias);
  if (!detalhes) {
    return {
      titulo: receita ? `Você tem uma receita prevista para ${quando}` : `Você tem uma conta que vence ${quando}`,
      texto: 'Abra o Controle Financeiro para ver.',
    };
  }
  const prefixo = receita ? `Receita prevista para ${quando}` : `Vence ${quando}`;
  return {
    titulo: `${prefixo}: ${l.descricao}`,
    texto: [moeda.format(l.valorCentavos / 100), nomeCategoria].filter(Boolean).join(' · '),
  };
}

/** Devolve [{ id, quando: Date, titulo, texto, lancamentoId }] em ordem de horário. */
export function planejarNotificacoes(estado, { agora = new Date(), maximo = 60 } = {}) {
  const cfg = estado?.config?.lembretes;
  if (!cfg?.ativo) return [];
  const hoje = dataLocal(agora);
  const nomeCat = new Map((estado.categorias ?? []).map((c) => [c.id, c.nome]));
  const planos = [];

  for (const l of estado.lancamentos ?? []) {
    if (l.status !== 'Pendente' || l.data < hoje) continue;
    const avisos = [{ dias: 0, quando: momento(l.data, cfg.hora), sufixo: 0 }];
    if (cfg.diasAntes > 0) avisos.push({ dias: cfg.diasAntes, quando: momento(l.data, cfg.hora, -cfg.diasAntes), sufixo: 1 });
    for (const a of avisos) {
      if (a.quando <= agora) continue;
      planos.push({
        // id numérico estável e único por aviso (o Android exige inteiro de 32 bits)
        id: l.id * 10 + a.sufixo,
        quando: a.quando,
        lancamentoId: l.id,
        ...textos(l, a.dias, cfg.detalhes, nomeCat.get(l.categoriaId)),
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
