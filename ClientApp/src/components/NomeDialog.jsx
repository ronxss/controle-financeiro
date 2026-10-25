import { useEffect, useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField } from '@mui/material';

/** Dialog simples para criar/editar categoria (com tipo) ou conta (apenas nome). */
export default function NomeDialog({ open, titulo, valorInicial, comTipo, onClose, onSalvar }) {
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState('Despesa');
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (open) {
      setNome(valorInicial?.nome ?? '');
      setTipo(valorInicial?.tipo ?? 'Despesa');
      setErro('');
    }
  }, [open, valorInicial]);

  const salvar = async () => {
    if (!nome.trim()) return setErro('Informe o nome.');
    try {
      await onSalvar({ nome: nome.trim(), tipo });
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
