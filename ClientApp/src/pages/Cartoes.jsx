import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardContent, Chip, Divider, Skeleton, Snackbar, Stack, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import { api } from '../api.js';
import { useMes } from '../MesContext.jsx';
import { brl, dataBR, rotuloMes } from '../utils/format.js';
import ConfirmDialog from '../components/ConfirmDialog.jsx';

const SITUACAO = {
  aberta: { rotulo: 'Aberta', cor: 'info' },
  fechada: { rotulo: 'Fechada', cor: 'warning' },
  vencida: { rotulo: 'Vencida', cor: 'error' },
  paga: { rotulo: 'Paga', cor: 'success' },
  vazia: { rotulo: 'Sem compras', cor: 'default' },
};

function Fatura({ f, onPagar }) {
  const s = SITUACAO[f.situacao];
  return (
    <Card>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
            <CreditCardIcon color="primary" />
            <Typography variant="h6" fontWeight={500} sx={{ overflowWrap: 'anywhere' }}>{f.nome}</Typography>
          </Stack>
          <Chip size="small" label={s.rotulo} color={s.cor} variant={f.situacao === 'paga' ? 'filled' : 'outlined'} />
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Vence {dataBR(f.vencimento)} · fecha {dataBR(f.fechamento)} · compras de {dataBR(f.inicio)} a {dataBR(f.fechamento)}
        </Typography>

        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, mt: 2 }}>
          <Box>
            <Typography variant="caption" color="text.secondary">Total</Typography>
            <Typography fontWeight={700}>{brl(f.total)}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">Pago</Typography>
            <Typography fontWeight={500} color="success.main">{brl(f.pago)}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">A pagar</Typography>
            <Typography fontWeight={700} color={f.pendente > 0 ? 'error.main' : undefined}>{brl(f.pendente)}</Typography>
          </Box>
        </Box>

        {f.pendente > 0 && (
          <Button variant="contained" fullWidth sx={{ mt: 2 }} onClick={() => onPagar(f)}>
            Pagar fatura ({brl(f.pendente)})
          </Button>
        )}

        {f.itens.length > 0 && (
          <>
            <Divider sx={{ my: 2 }} />
            <Stack spacing={1}>
              {f.itens.map((l) => (
                <Stack key={l.id} direction="row" justifyContent="space-between" spacing={1} alignItems="center">
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={500} sx={{ overflowWrap: 'anywhere' }}>
                      {l.descricao}
                      {l.parcela && <Chip size="small" label={`${l.parcela.numero}/${l.parcela.total}`} variant="outlined" sx={{ ml: 1, height: 18, fontSize: 11 }} />}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">{dataBR(l.data)} · {l.categoria}</Typography>
                  </Box>
                  <Stack alignItems="flex-end" sx={{ flexShrink: 0 }}>
                    <Typography variant="body2" fontWeight={500} color={l.tipo === 'Receita' ? 'success.main' : undefined}>
                      {l.tipo === 'Receita' ? '− ' : ''}{brl(l.valor)}
                    </Typography>
                    <Typography variant="caption" color={l.status === 'Pendente' ? 'warning.main' : 'success.main'}>
                      {l.status === 'Pendente' ? 'Pendente' : 'Pago'}
                    </Typography>
                  </Stack>
                </Stack>
              ))}
            </Stack>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Faturas dos cartões de crédito que vencem no mês selecionado (modo local). */
export default function Cartoes() {
  const { mes } = useMes();
  const navigate = useNavigate();
  const [faturas, setFaturas] = useState(null);
  const [erro, setErro] = useState('');
  const [msg, setMsg] = useState('');
  const [pagar, setPagar] = useState(null);

  const carregar = useCallback(() => {
    api.get(`/api/cartoes?mes=${mes}`).then((d) => { setFaturas(d); setErro(''); }).catch((e) => setErro(e.message));
  }, [mes]);
  useEffect(() => { setFaturas(null); carregar(); }, [carregar]);

  const confirmarPagamento = async () => {
    try {
      const r = await api.post(`/api/cartoes/${pagar.contaId}/pagar`, { mes });
      setMsg(`Fatura ${pagar.nome} paga (${r.pagos} ${r.pagos === 1 ? 'lançamento' : 'lançamentos'}).`);
      carregar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setPagar(null);
    }
  };

  const totalPendente = faturas?.reduce((t, f) => t + Math.max(0, f.pendente), 0) ?? 0;

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
        <Typography variant="h5" fontWeight={700}>Cartões</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/lancamentos?novo=1')}>Nova compra</Button>
      </Stack>
      <Typography color="text.secondary">
        Faturas que vencem em {rotuloMes(mes).toLowerCase()}.
        {totalPendente > 0 && <> A pagar: <strong>{brl(totalPendente)}</strong>.</>}
      </Typography>

      {erro && <Alert severity="error" onClose={() => setErro('')}>{erro}</Alert>}
      {!faturas && !erro && <Skeleton variant="rounded" height={220} />}

      {faturas?.length === 0 && (
        <Alert
          severity="info"
          action={<Button color="inherit" size="small" onClick={() => navigate('/cadastros')}>Configurar</Button>}
        >
          Nenhum cartão configurado. Em Cadastros → Contas, edite a conta do cartão, ative “É um cartão de crédito” e informe
          os dias de fechamento e vencimento.
        </Alert>
      )}

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' } }}>
        {faturas?.map((f) => <Fatura key={f.contaId} f={f} onPagar={setPagar} />)}
      </Box>

      <ConfirmDialog
        open={Boolean(pagar)} titulo="Pagar fatura?" rotuloConfirmar="Marcar como paga" cor="primary"
        texto={pagar ? `Todos os lançamentos pendentes da fatura ${pagar.nome} (${brl(pagar.pendente)}) serão marcados como pagos.` : ''}
        onConfirmar={confirmarPagamento} onCancelar={() => setPagar(null)}
      />
      <Snackbar open={Boolean(msg)} autoHideDuration={4000} onClose={() => setMsg('')} message={msg} />
    </Stack>
  );
}
