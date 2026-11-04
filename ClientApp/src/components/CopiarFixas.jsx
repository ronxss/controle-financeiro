import { useState } from 'react';
import { Button } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { api } from '../api.js';

/** Recria, no mês exibido, as despesas fixas do mês anterior (como Pendente). Não duplica o que já existe. */
export default function CopiarFixas({ mes, onFeito, onErro, size = 'medium', variant = 'outlined' }) {
  const [ocupado, setOcupado] = useState(false);

  const copiar = async () => {
    setOcupado(true);
    try {
      const r = await api.post('/api/despesas-fixas/copiar', { mes });
      let texto;
      if (r.encontradas === 0) texto = 'O mês anterior não tem despesas fixas para copiar.';
      else if (r.criadas === 0) texto = 'Todas as despesas fixas do mês anterior já estão neste mês.';
      else texto = `${r.criadas} ${r.criadas === 1 ? 'despesa fixa copiada' : 'despesas fixas copiadas'} como pendente${r.criadas === 1 ? '' : 's'}.`;
      onFeito(texto);
    } catch (e) {
      onErro?.(e.message);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Button size={size} variant={variant} startIcon={<ContentCopyIcon />} onClick={copiar} disabled={ocupado}>
      Copiar fixas do mês anterior
    </Button>
  );
}
