import { useEffect, useState } from 'react';
import {
  Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Stack, Switch, TextField, Typography,
} from '@mui/material';

const DIAS = Array.from({ length: 31 }, (_, i) => i + 1);

/** Dialog simples para criar/editar categoria (com tipo) ou conta (nome e, no modo local, se é cartão de crédito). */
export default function NomeDialog({ open, titulo, valorInicial, comTipo, comCartao, onClose, onSalvar }) {
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState('Despesa');
  const [erro, setErro] = useState('');
  const [ehCartao, setEhCartao] = useState(false);
  const [fechamento, setFechamento] = useState(5);
  const [vencimento, setVencimento] = useState(12);

  useEffect(() => {
    if (open) {
      setNome(valorInicial?.nome ?? '');
      setTipo(valorInicial?.tipo ?? 'Despesa');
      setEhCartao(Boolean(valorInicial?.cartao));
      setFechamento(valorInicial?.cartao?.fechamento ?? 5);
      setVencimento(valorInicial?.cartao?.vencimento ?? 12);
      setErro('');
    }
  }, [open, valorInicial]);

  const salvar = async () => {
    if (!nome.trim()) return setErro('Informe o nome.');
    try {
      await onSalvar({ nome: nome.trim(), tipo, cartao: ehCartao ? { fechamento, vencimento } : null });
      onClose();
    } catch (e) {
      setErro(e.message);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{titulo}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {erro && <Alert severity="error">{erro}</Alert>}
          <TextField label="Nome" value={nome} onChange={(e) => setNome(e.target.value)} autoFocus
            onKeyDown={(e) => e.key === 'Enter' && salvar()} slotProps={{ htmlInput: { maxLength: 60 } }} />
          {comCartao && (
            <>
              <FormControlLabel
                control={<Switch checked={ehCartao} onChange={(e) => setEhCartao(e.target.checked)} />}
                label="É um cartão de crédito"
              />
              {ehCartao && (
                <>
                  <Stack direction="row" spacing={2}>
                    <TextField select fullWidth label="Dia do fechamento" value={fechamento} onChange={(e) => setFechamento(Number(e.target.value))}>
                      {DIAS.map((d) => <MenuItem key={d} value={d}>{d}</MenuItem>)}
                    </TextField>
                    <TextField select fullWidth label="Dia do vencimento" value={vencimento} onChange={(e) => setVencimento(Number(e.target.value))}>
                      {DIAS.map((d) => <MenuItem key={d} value={d}>{d}</MenuItem>)}
                    </TextField>
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    Compras até o dia do fechamento entram na fatura que vence no dia {vencimento}
                    {vencimento > fechamento ? ' do mesmo mês' : ' do mês seguinte'}. Em meses mais curtos vale o último dia.
                  </Typography>
                </>
              )}
            </>
          )}
          {comTipo && (
            <TextField select label="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <MenuItem value="Despesa">Despesa</MenuItem>
              <MenuItem value="Receita">Receita</MenuItem>
            </TextField>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" onClick={salvar}>Salvar</Button>
      </DialogActions>
    </Dialog>
  );
}
