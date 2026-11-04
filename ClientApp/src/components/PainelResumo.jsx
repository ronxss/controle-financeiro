import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Card, CardContent, Chip, LinearProgress, Skeleton, Snackbar, Stack, Typography } from '@mui/material';
import PushPinIcon from '@mui/icons-material/PushPin';
import ArrowDropUpIcon from '@mui/icons-material/ArrowDropUp';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import { api } from '../api.js';
import { brl, dataBR, pct } from '../utils/format.js';
import GraficoBarras from './GraficoBarras.jsx';
import CopiarFixas from './CopiarFixas.jsx';

const COR = { ok: 'success', alerta: 'warning', estourado: 'error', semLimite: 'inherit' };
const ROTULO = { ok: 'Dentro do limite', alerta: 'Atenção', estourado: 'Estourou', semLimite: 'Sem limite' };

function Secao({ titulo, acao, children }) {
  return (
    <Card>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1} sx={{ mb: 1.5, flexWrap: 'wrap' }} useFlexGap>
          <Typography variant="h6" fontWeight={500}>{titulo}</Typography>
          {acao}
        </Stack>
        {children}
      </CardContent>
    </Card>
  );
}

function Barra({ valor, situacao, altura = 8 }) {
  return (
    <LinearProgress
      variant="determinate" value={Math.min(100, Math.max(0, valor))} color={COR[situacao] === 'inherit' ? 'primary' : COR[situacao]}
      sx={{ height: altura, borderRadius: altura / 2 }}
    />
  );
}

/** Métricas de gastos e orçamento do mês (só no modo local). Se a rota não existir, simplesmente não aparece. */
export default function PainelResumo({ mes, versao = 0 }) {
  const [d, setD] = useState(null);
  const [falhou, setFalhou] = useState(false);
  const [erro, setErro] = useState('');
  const [msg, setMsg] = useState('');

  const carregar = useCallback(() => {
    api.get(`/api/dashboard?mes=${mes}`).then((r) => { setD(r); setFalhou(false); }).catch(() => setFalhou(true));
  }, [mes]);

  useEffect(() => { setD(null); carregar(); }, [carregar, versao]);

  if (falhou) return null;
  if (!d) return <Skeleton variant="rounded" height={220} />;

  const o = d.orcamento;
  const sitTotal = o.limiteTotal <= 0 ? 'semLimite' : o.percentual > 100 ? 'estourado' : o.percentual >= 80 ? 'alerta' : 'ok';
  const v = d.comparativo.variacaoDespesas;
  const totalDesp = d.despesas.total;
  const pctFixas = d.percentualFixas;
  const copiado = (texto) => { setMsg(texto); carregar(); };

  return (
    <Stack spacing={3}>
      {erro && <Alert severity="error" onClose={() => setErro('')}>{erro}</Alert>}

      <Secao titulo="Orçamento do mês">
        {o.limiteTotal <= 0 ? (
          <Typography color="text.secondary">
            Nenhum limite definido. Defina limites por categoria na tela Orçamento para acompanhar aqui.
          </Typography>
        ) : (
          <Stack spacing={2}>
            <Box>
              <Stack direction="row" justifyContent="space-between" alignItems="baseline" flexWrap="wrap" useFlexGap>
                <Typography variant="h5" fontWeight={700}>{brl(o.realizado)}</Typography>
                <Typography color="text.secondary">de {brl(o.limiteTotal)} ({pct(o.percentual)})</Typography>
              </Stack>
              <Box sx={{ mt: 0.5 }}><Barra valor={o.percentual} situacao={sitTotal} altura={12} /></Box>
              <Typography variant="body2" sx={{ mt: 0.5 }} color={o.disponivel < 0 ? 'error.main' : 'text.secondary'}>
                {o.disponivel < 0 ? `Passou ${brl(-o.disponivel)} do total dos limites` : `Disponível: ${brl(o.disponivel)}`}
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip size="small" color="warning" variant={o.emAlerta ? 'filled' : 'outlined'} label={`${o.emAlerta} em atenção`} />
              <Chip size="small" color="error" variant={o.estouradas ? 'filled' : 'outlined'} label={`${o.estouradas} estourada${o.estouradas === 1 ? '' : 's'}`} />
              <Chip size="small" variant="outlined" label={`${o.categoriasComLimite} com limite`} />
            </Stack>
          </Stack>
        )}

        {o.categorias.length > 0 && (
          <Stack spacing={1.75} sx={{ mt: 2.5 }}>
            {o.categorias.map((c) => (
              <Box key={c.categoriaId}>
                <Stack direction="row" justifyContent="space-between" spacing={1}>
                  <Typography sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>{c.categoria}</Typography>
                  <Typography fontWeight={500} sx={{ whiteSpace: 'nowrap' }}>
                    {brl(c.realizado)}{c.limite > 0 && <Typography component="span" variant="body2" color="text.secondary"> / {brl(c.limite)}</Typography>}
                  </Typography>
                </Stack>
                {c.limite > 0 ? (
                  <>
                    <Barra valor={c.percentual} situacao={c.situacao} />
                    <Typography variant="caption" color={c.situacao === 'estourado' ? 'error.main' : 'text.secondary'}>
                      {ROTULO[c.situacao]} · {pct(c.percentual)}
                      {c.pendente > 0 && ` · ${brl(c.pendente)} pendente`}
                    </Typography>
                  </>
                ) : (
                  <Typography variant="caption" color="text.secondary">
                    Sem limite{c.pendente > 0 && ` · ${brl(c.pendente)} pendente`}
                  </Typography>
                )}
              </Box>
            ))}
          </Stack>
        )}
        {o.semLimiteRealizado > 0 && o.limiteTotal > 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
            Mais {brl(o.semLimiteRealizado)} gastos em categorias sem limite (não entram no total acima).
          </Typography>
        )}
      </Secao>

      <Secao titulo="Despesas fixas × variáveis" acao={<CopiarFixas mes={mes} size="small" onFeito={copiado} onErro={setErro} />}>
        {totalDesp <= 0 ? (
          <Typography color="text.secondary">Nenhuma despesa neste mês.</Typography>
        ) : (
          <Stack spacing={2}>
            <Box>
              <Box
                role="img" aria-label={`Fixas ${pct(pctFixas)} e variáveis ${pct(100 - pctFixas)} das despesas do mês`}
                sx={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', bgcolor: 'action.hover' }}
              >
                <Box sx={{ width: `${pctFixas}%`, bgcolor: 'primary.main' }} />
                <Box sx={{ width: `${100 - pctFixas}%`, bgcolor: 'secondary.light' }} />
              </Box>
              <Stack direction="row" justifyContent="space-between" sx={{ mt: 1 }} spacing={2}>
                <Box>
                  <Typography variant="caption" color="text.secondary">Fixas ({pct(pctFixas)})</Typography>
                  <Typography fontWeight={700}>{brl(d.fixas.total)}</Typography>
                  {d.fixas.pendentes > 0 && <Typography variant="caption" color="text.secondary">{brl(d.fixas.pendentes)} pendente</Typography>}
                </Box>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography variant="caption" color="text.secondary">Variáveis ({pct(100 - pctFixas)})</Typography>
                  <Typography fontWeight={700}>{brl(d.variaveis.total)}</Typography>
                  {d.variaveis.pendentes > 0 && <Typography variant="caption" color="text.secondary">{brl(d.variaveis.pendentes)} pendente</Typography>}
                </Box>
              </Stack>
            </Box>
          </Stack>
        )}
        {d.fixas.itens.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            Nenhuma despesa fixa neste mês. Marque uma despesa como fixa (ícone de alfinete em Lançamentos) ou copie as do mês anterior.
          </Typography>
        ) : (
          <Stack divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />} spacing={1} sx={{ mt: 2 }}>
            {d.fixas.itens.map((l) => (
              <Stack key={l.id} direction="row" justifyContent="space-between" spacing={1} alignItems="center" sx={{ pt: 1 }}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ overflowWrap: 'anywhere' }}>{l.descricao}</Typography>
                  <Typography variant="caption" color="text.secondary">{dataBR(l.data)} · {l.categoria}</Typography>
                </Box>
                <Stack alignItems="flex-end" sx={{ flexShrink: 0 }}>
                  <Typography fontWeight={500}>{brl(l.valor)}</Typography>
                  <Chip size="small" label={l.status === 'Pendente' ? 'Pendente' : 'Pago'} color={l.status === 'Pendente' ? 'warning' : 'success'} variant={l.status === 'Pendente' ? 'outlined' : 'filled'} />
                </Stack>
              </Stack>
            ))}
          </Stack>
        )}
      </Secao>

      <Secao titulo="Evolução em 6 meses">
        <GraficoBarras dados={d.evolucao} />
        <Stack direction="row" spacing={2} sx={{ mt: 0.5 }} justifyContent="center">
          <Stack direction="row" spacing={0.75} alignItems="center"><Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: 'success.main' }} /><Typography variant="caption">Receitas</Typography></Stack>
          <Stack direction="row" spacing={0.75} alignItems="center"><Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: 'error.main' }} /><Typography variant="caption">Despesas</Typography></Stack>
        </Stack>
      </Secao>

      <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' } }}>
        <Secao titulo="Ritmo de gastos">
          <Stack spacing={1}>
            <Stack direction="row" justifyContent="space-between"><Typography color="text.secondary">Média por dia</Typography><Typography fontWeight={500}>{brl(d.ritmo.mediaDiaria)}</Typography></Stack>
            {d.ritmo.projecaoDespesas !== null && (
              <Stack direction="row" justifyContent="space-between"><Typography color="text.secondary">Projeção do mês</Typography><Typography fontWeight={500}>{brl(d.ritmo.projecaoDespesas)}</Typography></Stack>
            )}
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography color="text.secondary">Mês anterior</Typography>
              <Typography fontWeight={500}>{brl(d.comparativo.despesasPagasMesAnterior)}</Typography>
            </Stack>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography color="text.secondary">Variação das despesas</Typography>
              {v === null ? (
                <Typography color="text.secondary">sem base de comparação</Typography>
              ) : (
                <Stack direction="row" alignItems="center" sx={{ color: v > 0 ? 'error.main' : v < 0 ? 'success.main' : 'text.secondary' }}>
                  {v > 0 ? <ArrowDropUpIcon /> : v < 0 ? <ArrowDropDownIcon /> : null}
                  <Typography fontWeight={700}>{Math.abs(v).toFixed(1).replace('.', ',')}%</Typography>
                </Stack>
              )}
            </Stack>
          </Stack>
        </Secao>

        <Secao titulo="Maiores despesas">
          {d.maioresDespesas.length === 0 ? (
            <Typography color="text.secondary">Nenhuma despesa neste mês.</Typography>
          ) : (
            <Stack spacing={1.25}>
              {d.maioresDespesas.map((l) => (
                <Stack key={l.id} direction="row" justifyContent="space-between" spacing={1}>
                  <Box sx={{ minWidth: 0 }}>
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      {l.fixa && <PushPinIcon sx={{ fontSize: 14 }} color="primary" titleAccess="Fixa" />}
                      <Typography sx={{ overflowWrap: 'anywhere' }}>{l.descricao}</Typography>
                    </Stack>
                    <Typography variant="caption" color="text.secondary">{l.categoria} · {dataBR(l.data)}</Typography>
                  </Box>
                  <Typography fontWeight={500} sx={{ whiteSpace: 'nowrap' }}>{brl(l.valor)}</Typography>
                </Stack>
              ))}
            </Stack>
          )}
        </Secao>
      </Box>

      <Snackbar open={Boolean(msg)} autoHideDuration={4000} onClose={() => setMsg('')} message={msg} />
    </Stack>
  );
}
