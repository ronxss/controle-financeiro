import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, InputAdornment, LinearProgress, Skeleton, Snackbar, Stack, Table,
  TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { api } from '../api.js';
import { useMes } from '../MesContext.jsx';
import { brl, parseValor } from '../utils/format.js';

export default function Orcamento() {
  const { mes } = useMes();
  const [itens, setItens] = useState(null);
  const [limites, setLimites] = useState({}); // categoriaId -> texto digitado
  const [erro, setErro] = useState('');
  const [msg, setMsg] = useState('');
  const [salvando, setSalvando] = useState(false);

  const carregar = async () => {
    try {
      const d = await api.get(`/api/orcamento?mes=${mes}`);
      setItens(d);
      setLimites(Object.fromEntries(d.map((i) => [i.categoriaId, i.limite ? String(i.limite).replace('.', ',') : ''])));
      setErro('');
    } catch (e) {
      setErro(e.message);
    }
  };

  useEffect(() => { setItens(null); carregar(); }, [mes]); // eslint-disable-line react-hooks/exhaustive-deps

  const numero = (id) => {
    const t = limites[id];
    if (!t || !t.trim()) return 0;
    const n = parseValor(t);
    return Number.isNaN(n) ? null : n;
  };

  const invalido = itens?.some((i) => numero(i.categoriaId) === null);

  const salvar = async () => {
    setSalvando(true);
    try {
      await api.put('/api/orcamento', itens.map((i) => ({ categoriaId: i.categoriaId, limite: numero(i.categoriaId) })));
      setMsg('Limites salvos.');
      carregar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h5" fontWeight={700}>Orçamento mensal</Typography>
        <Button variant="contained" onClick={salvar} disabled={!itens || salvando || invalido}>Salvar limites</Button>
      </Stack>
      <Typography color="text.secondary">
        Defina um limite por categoria. O realizado considera apenas despesas já pagas no mês selecionado.
      </Typography>

      {erro && <Alert severity="error" onClose={() => setErro('')}>{erro}</Alert>}
      {!itens && <Skeleton variant="rounded" height={300} />}

      {itens && (
        <Card>
          <CardContent sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Categoria</TableCell>
                  <TableCell sx={{ width: 170 }}>Limite mensal</TableCell>
                  <TableCell align="right">Realizado</TableCell>
                  <TableCell align="right">Disponível</TableCell>
                  <TableCell sx={{ minWidth: 140 }}>% do limite</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {itens.map((i) => {
                  const lim = numero(i.categoriaId) ?? 0;
                  const pct = lim > 0 ? (i.realizado / lim) * 100 : 0;
                  const cor = pct > 100 ? 'error' : pct >= 80 ? 'warning' : 'success';
                  return (
                    <TableRow key={i.categoriaId}>
                      <TableCell>{i.categoria}</TableCell>
                      <TableCell>
                        <TextField
                          size="small" value={limites[i.categoriaId] ?? ''} placeholder="0,00"
                          error={numero(i.categoriaId) === null}
                          onChange={(e) => setLimites((p) => ({ ...p, [i.categoriaId]: e.target.value }))}
                          slotProps={{
                            input: { startAdornment: <InputAdornment position="start">R$</InputAdornment> },
                            htmlInput: { inputMode: 'decimal' },
                          }}
                        />
                      </TableCell>
                      <TableCell align="right">{brl(i.realizado)}</TableCell>
                      <TableCell align="right" sx={{ color: lim - i.realizado < 0 ? 'error.main' : undefined, fontWeight: 500 }}>
                        {brl(lim - i.realizado)}
                      </TableCell>
                      <TableCell>
                        {lim > 0 ? (
                          <Box>
                            <LinearProgress variant="determinate" value={Math.min(pct, 100)} color={cor} sx={{ height: 8, borderRadius: 4 }} />
                            <Typography variant="caption" color="text.secondary">{pct.toFixed(0)}%</Typography>
                          </Box>
                        ) : (
                          <Typography variant="caption" color="text.secondary">sem limite</Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      <Snackbar open={Boolean(msg)} autoHideDuration={3000} onClose={() => setMsg('')} message={msg} />
    </Stack>
  );
}
