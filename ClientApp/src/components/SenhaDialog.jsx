import { useEffect, useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField } from '@mui/material';
import { api } from '../api.js';

export default function SenhaDialog({ open, onClose }) {
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (open) { setAtual(''); setNova(''); setErro(''); setOk(false); }
  }, [open]);

  const salvar = async () => {
    setErro('');
    setSalvando(true);
    try {
      await api.post('/api/auth/alterar-senha', { senhaAtual: atual, novaSenha: nova });
      setOk(true);
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Alterar senha</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {ok && <Alert severity="success">Senha alterada com sucesso.</Alert>}
          {erro && <Alert severity="error">{erro}</Alert>}
          {!ok && (
            <>
              <TextField label="Senha atual" type="password" autoComplete="current-password" value={atual}
                onChange={(e) => setAtual(e.target.value)} autoFocus />
              <TextField label="Nova senha" type="password" autoComplete="new-password" value={nova}
                onChange={(e) => setNova(e.target.value)}
                helperText="Mínimo de 8 caracteres, com letra maiúscula, minúscula e número." />
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{ok ? 'Fechar' : 'Cancelar'}</Button>
        {!ok && <Button variant="contained" onClick={salvar} disabled={salvando || !atual || !nova}>Salvar</Button>}
      </DialogActions>
    </Dialog>
  );
}
