import { useState } from 'react';
import {
  Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Radio, RadioGroup, Typography,
} from '@mui/material';
import { exportarCsv } from '../local/backup.js';
import { diasNoMes } from '../local/engine.js';
import { rotuloMes } from '../utils/format.js';

function mensagem({ resultado, salvoEm, quantidade }) {
  const n = `${quantidade} ${quantidade === 1 ? 'lançamento' : 'lançamentos'}`;
  if (resultado === 'vazio') return 'Não há lançamentos nesse período.';
  if (resultado === 'baixado') return `Planilha com ${n} salva na pasta Downloads.`;
  if (resultado === 'compartilhado') return `Planilha com ${n} pronta.${salvoEm ? ` Cópia em ${salvoEm}.` : ''}`;
  if (resultado === 'salvo') return `Planilha com ${n} salva em ${salvoEm}.`;
  return 'Exportação cancelada.';
}

/** Exporta os lançamentos em CSV (abre no Excel, Google Planilhas, LibreOffice). */
export default function ExportarCsvDialog({ open, mes, onClose, onAviso }) {
  const [periodo, setPeriodo] = useState('mes');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const ano = mes.slice(0, 4);

  const exportar = async () => {
    setOcupado(true);
    setErro('');
    try {
      const op = {
        mes: { de: `${mes}-01`, ate: `${mes}-${diasNoMes(mes)}`, sufixo: mes },
        ano: { de: `${ano}-01-01`, ate: `${ano}-12-31`, sufixo: ano },
        tudo: { sufixo: 'tudo' },
      }[periodo];
      const r = await exportarCsv(op);
      if (r.resultado === 'vazio') { setErro(mensagem(r)); return; }
      onAviso(mensagem(r));
      onClose();
    } catch (e) {
      setErro(e.message || 'Não foi possível gerar a planilha.');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Exportar planilha</DialogTitle>
      <DialogContent>
        {erro && <Alert severity="warning" sx={{ mb: 1.5 }}>{erro}</Alert>}
        <RadioGroup value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
          <FormControlLabel value="mes" control={<Radio />} label={rotuloMes(mes)} />
          <FormControlLabel value="ano" control={<Radio />} label={`Ano de ${ano}`} />
          <FormControlLabel value="tudo" control={<Radio />} label="Todos os lançamentos" />
        </RadioGroup>
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
          Arquivo CSV que abre no Excel, Google Planilhas e LibreOffice. A coluna Valor vem com sinal (despesas negativas),
          então dá para somar direto. Não é criptografado.
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" onClick={exportar} disabled={ocupado}>Exportar</Button>
      </DialogActions>
    </Dialog>
  );
}
