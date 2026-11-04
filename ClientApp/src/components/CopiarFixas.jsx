import { useState } from 'react';
import { Button } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { api } from '../api.js';

/** Recria, no mês exibido, as receitas e despesas fixas do mês anterior (como Pendente). Não duplica o que já existe. */
export default function CopiarFixas({ mes, onFeito, onErro, size = 'medium', variant = 'outlined' }) {
  const [ocupado, setOcupado] = useState(false);

  const copiar = async () => {
    setOcupado(true);
    try {
      const r = await api.post('/api/lancamentos-fixos/copiar', { mes });
      const conta = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
      let texto;
      if (r.encontradas === 0) texto = 'O mês anterior não tem receitas nem despesas fixas para copiar.';
      else if (r.criadas === 0) texto = 'Todos os lançamentos fixos do mês anterior já estão neste mês.';
      else {
        const partes = [];
        if (r.receitasCriadas) partes.push(conta(r.receitasCriadas, 'receita', 'receitas'));
        if (r.despesasCriadas) partes.push(conta(r.despesasCriadas, 'despesa', 'despesas'));
        texto = `Copiado como pendente: ${partes.join(' e ')}.`;
      }
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
