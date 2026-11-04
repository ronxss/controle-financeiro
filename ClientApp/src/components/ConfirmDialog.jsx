import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material';

export default function ConfirmDialog({ open, titulo, texto, rotuloConfirmar = 'Excluir', cor = 'error', onConfirmar, onCancelar }) {
  return (
    <Dialog open={open} onClose={onCancelar}>
      <DialogTitle>{titulo}</DialogTitle>
      <DialogContent>
        <DialogContentText>{texto}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancelar}>Cancelar</Button>
        <Button color={cor} variant="contained" onClick={onConfirmar}>{rotuloConfirmar}</Button>
      </DialogActions>
    </Dialog>
  );
}
