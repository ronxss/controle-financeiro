import { useEffect, useState } from 'react';
import {
  Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, InputAdornment,
  MenuItem, Stack, Switch, TextField, ToggleButton, ToggleButtonGroup,
} from '@mui/material';
import { api } from '../api.js';
import { dataPadrao, parseValor } from '../utils/format.js';

/** Formulário de registro: um único passo, com os mesmos campos da aba "Lançamentos" da planilha. */
export default function LancamentoDialog({ open, item, categorias, contas, mes, onClose, onSaved }) {
  const editando = Boolean(item);
  const [f, setF] = useState(null);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErro('');
    setAviso('');
    setF(
      item
        ? {
            tipo: item.tipo,
            valor: String(item.valor).replace('.', ','),
            descricao: item.descricao,
            categoriaId: item.categoriaId,
            contaId: item.contaId,
            data: item.data,
            pago: item.status === 'PagoRecebido',
          }
        : { tipo: 'Despesa', valor: '', descricao: '', categoriaId: '', contaId: contas[0]?.id ?? '', data: dataPadrao(mes), pago: true }
    );
  }, [open, item]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!f) return null;
  const set = (campo) => (e) => setF((p) => ({ ...p, [campo]: e.target.value }));
  const categoriasDoTipo = categorias.filter((c) => c.tipo === f.tipo);
  const verbo = f.tipo === 'Receita' ? 'recebido' : 'pago';

  const salvar = async (continuar) => {
    setErro('');
    setAviso('');
    const valor = parseValor(f.valor);
    if (Number.isNaN(valor) || valor <= 0) return setErro('Informe um valor válido, maior que zero. Ex.: 150,90');
    if (!f.descricao.trim()) return setErro('Informe uma descrição.');
    if (!f.categoriaId) return setErro('Selecione a categoria.');
    if (!f.contaId) return setErro('Selecione a conta.');
    if (!f.data) return setErro('Informe a data.');

    const payload = {
      data: f.data,
      tipo: f.tipo,
      categoriaId: Number(f.categoriaId),
      descricao: f.descricao.trim(),
      contaId: Number(f.contaId),
      valor,
      status: f.pago ? 'PagoRecebido' : 'Pendente',
    };

    setSalvando(true);
    try {
      if (editando) await api.put(`/api/lancamentos/${item.id}`, payload);
      else await api.post('/api/lancamentos', payload);
      onSaved();
      if (continuar && !editando) {
        setF((p) => ({ ...p, valor: '', descricao: '' }));
        setAviso('Lançamento salvo! Pode registrar o próximo.');
      } else {
        onClose();
      }
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{editando ? 'Editar lançamento' : 'Novo lançamento'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          {aviso && <Alert severity="success">{aviso}</Alert>}
          {erro && <Alert severity="error">{erro}</Alert>}

          <ToggleButtonGroup
            exclusive fullWidth value={f.tipo}
            onChange={(_, v) => v && setF((p) => ({ ...p, tipo: v, categoriaId: '' }))}
          >
            <ToggleButton value="Despesa" color="error">Despesa</ToggleButton>
            <ToggleButton value="Receita" color="success">Receita</ToggleButton>
          </ToggleButtonGroup>

          <TextField
            label="Valor" value={f.valor} onChange={set('valor')} autoFocus placeholder="0,00"
            slotProps={{
              input: { startAdornment: <InputAdornment position="start">R$</InputAdornment> },
              htmlInput: { inputMode: 'decimal' },
            }}
            sx={{ '& input': { fontSize: 22, fontWeight: 500 } }}
          />

          <TextField label="Descrição" value={f.descricao} onChange={set('descricao')} slotProps={{ htmlInput: { maxLength: 200 } }} />

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField select fullWidth label="Categoria" value={f.categoriaId} onChange={set('categoriaId')}>
              {categoriasDoTipo.map((c) => <MenuItem key={c.id} value={c.id}>{c.nome}</MenuItem>)}
            </TextField>
            <TextField select fullWidth label="Conta" value={f.contaId} onChange={set('contaId')}>
              {contas.map((c) => <MenuItem key={c.id} value={c.id}>{c.nome}</MenuItem>)}
            </TextField>
          </Stack>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
            <TextField
              fullWidth type="date" label="Data" value={f.data} onChange={set('data')}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <FormControlLabel
              sx={{ minWidth: 160 }}
              control={<Switch checked={f.pago} onChange={(e) => setF((p) => ({ ...p, pago: e.target.checked }))} />}
              label={f.pago ? `Já ${verbo}` : 'Pendente'}
            />
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancelar</Button>
        {!editando && <Button onClick={() => salvar(true)} disabled={salvando}>Salvar e adicionar outro</Button>}
        <Button variant="contained" onClick={() => salvar(false)} disabled={salvando}>Salvar</Button>
      </DialogActions>
    </Dialog>
  );
}
