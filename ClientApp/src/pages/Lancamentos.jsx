import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Alert, Box, Chip, Fab, IconButton, InputAdornment, MenuItem, Paper, Skeleton, Snackbar, Stack, Table,
  TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, ToggleButton, ToggleButtonGroup,
  Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import { api } from '../api.js';
import { useMes } from '../MesContext.jsx';
import { useCadastros } from '../hooks.js';
import { brl, dataBR } from '../utils/format.js';
import LancamentoDialog from '../components/LancamentoDialog.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';

const rotuloStatus = (tipo, status) =>
  status === 'Pendente' ? 'Pendente' : tipo === 'Receita' ? 'Recebido' : 'Pago';

export default function Lancamentos() {
  const { mes } = useMes();
  const { categorias, contas, erro: erroCadastros } = useCadastros();
  const [params, setParams] = useSearchParams();

  const [tipo, setTipo] = useState('');
  const [status, setStatus] = useState('');
  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');

  const [itens, setItens] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [msg, setMsg] = useState('');

  const [dialog, setDialog] = useState({ aberto: false, item: null });
  const [excluir, setExcluir] = useState(null);

  const carregar = useCallback(async () => {
    const qs = new URLSearchParams({ mes });
    if (tipo) qs.set('tipo', tipo);
    if (status) qs.set('status', status);
    if (buscaAplicada) qs.set('busca', buscaAplicada);
    try {
      setItens(await api.get(`/api/lancamentos?${qs}`));
      setErro('');
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }, [mes, tipo, status, buscaAplicada]);

  useEffect(() => { setCarregando(true); carregar(); }, [carregar]);

  useEffect(() => {
    const t = setTimeout(() => setBuscaAplicada(busca.trim()), 350);
    return () => clearTimeout(t);
  }, [busca]);

  // /lancamentos?novo=1 abre direto o formulário (usado pelo botão da tela Resumo)
  useEffect(() => {
    if (params.get('novo')) {
      setDialog({ aberto: true, item: null });
      setParams({}, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const alternarStatus = async (l) => {
    try {
      await api.patch(`/api/lancamentos/${l.id}/status`, { status: l.status === 'Pendente' ? 'PagoRecebido' : 'Pendente' });
      carregar();
    } catch (e) {
      setErro(e.message);
    }
  };

  const confirmarExclusao = async () => {
    try {
      await api.delete(`/api/lancamentos/${excluir.id}`);
      setExcluir(null);
      setMsg('Lançamento excluído.');
      carregar();
    } catch (e) {
      setExcluir(null);
      setErro(e.message);
    }
  };

  const receitas = itens.filter((i) => i.tipo === 'Receita').reduce((s, i) => s + i.valor, 0);
  const despesas = itens.filter((i) => i.tipo === 'Despesa').reduce((s, i) => s + i.valor, 0);

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={700}>Lançamentos</Typography>

      {erro && <Alert severity="error" onClose={() => setErro('')}>{erro}</Alert>}
      {erroCadastros && <Alert severity="error">{erroCadastros}</Alert>}

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
        <ToggleButtonGroup exclusive size="small" value={tipo} onChange={(_, v) => setTipo(v ?? '')}>
          <ToggleButton value="">Todos</ToggleButton>
          <ToggleButton value="Receita" color="success">Receitas</ToggleButton>
          <ToggleButton value="Despesa" color="error">Despesas</ToggleButton>
        </ToggleButtonGroup>
        <TextField select size="small" label="Status" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ minWidth: 150 }}>
          <MenuItem value="">Todos</MenuItem>
          <MenuItem value="PagoRecebido">Pago/Recebido</MenuItem>
          <MenuItem value="Pendente">Pendente</MenuItem>
        </TextField>
        <TextField
          size="small" placeholder="Buscar na descrição" value={busca} onChange={(e) => setBusca(e.target.value)} sx={{ flex: 1 }}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
        />
      </Stack>

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <Chip label={`Receitas: ${brl(receitas)}`} color="success" variant="outlined" />
        <Chip label={`Despesas: ${brl(despesas)}`} color="error" variant="outlined" />
        <Chip label={`Diferença: ${brl(receitas - despesas)}`} variant="outlined" />
      </Stack>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Data</TableCell>
              <TableCell>Descrição</TableCell>
              <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Categoria</TableCell>
              <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Conta</TableCell>
              <TableCell align="right">Valor</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right" />
            </TableRow>
          </TableHead>
          <TableBody>
            {carregando && (
              <TableRow><TableCell colSpan={7}><Skeleton variant="rounded" height={80} /></TableCell></TableRow>
            )}
            {!carregando && itens.length === 0 && (
              <TableRow>
                <TableCell colSpan={7}>
                  <Box sx={{ py: 5, textAlign: 'center', color: 'text.secondary' }}>
                    Nenhum lançamento encontrado. Use o botão “Novo lançamento” para registrar.
                  </Box>
                </TableCell>
              </TableRow>
            )}
            {itens.map((l) => (
              <TableRow key={l.id} hover>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{dataBR(l.data)}</TableCell>
                <TableCell>
                  <Typography variant="body2" fontWeight={500}>{l.descricao}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'block', sm: 'none' } }}>
                    {l.categoria}
                  </Typography>
                </TableCell>
                <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{l.categoria}</TableCell>
                <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>{l.conta}</TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap', fontWeight: 500, color: l.tipo === 'Receita' ? 'success.main' : 'error.main' }}>
                  {l.tipo === 'Receita' ? '+ ' : '− '}{brl(l.valor)}
                </TableCell>
                <TableCell>
                  <Tooltip title="Clique para alterar o status">
                    <Chip
                      size="small" clickable onClick={() => alternarStatus(l)}
                      label={rotuloStatus(l.tipo, l.status)}
                      color={l.status === 'PagoRecebido' ? 'success' : 'warning'}
                      variant={l.status === 'PagoRecebido' ? 'filled' : 'outlined'}
                    />
                  </Tooltip>
                </TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                  <IconButton size="small" aria-label="Editar" onClick={() => setDialog({ aberto: true, item: l })}><EditIcon fontSize="small" /></IconButton>
                  <IconButton size="small" aria-label="Excluir" onClick={() => setExcluir(l)}><DeleteIcon fontSize="small" /></IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Fab
        color="primary" variant="extended" onClick={() => setDialog({ aberto: true, item: null })}
        sx={{ position: 'fixed', right: 24, bottom: { xs: 88, md: 24 } }}
      >
        <AddIcon sx={{ mr: 1 }} /> Novo lançamento
      </Fab>

      <LancamentoDialog
        open={dialog.aberto} item={dialog.item} categorias={categorias} contas={contas} mes={mes}
        onClose={() => setDialog({ aberto: false, item: null })} onSaved={carregar}
      />
      <ConfirmDialog
        open={Boolean(excluir)} titulo="Excluir lançamento?"
        texto={excluir ? `“${excluir.descricao}” (${brl(excluir.valor)}) será removido permanentemente.` : ''}
        onConfirmar={confirmarExclusao} onCancelar={() => setExcluir(null)}
      />
      <Snackbar open={Boolean(msg)} autoHideDuration={3000} onClose={() => setMsg('')} message={msg} />
    </Stack>
  );
}
