import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';

/** Carrega categorias e contas (listas da planilha). */
export function useCadastros() {
  const [categorias, setCategorias] = useState([]);
  const [contas, setContas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const recarregar = useCallback(async () => {
    try {
      const [c, a] = await Promise.all([api.get('/api/categorias'), api.get('/api/contas')]);
      setCategorias(c);
      setContas(a);
      setErro('');
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { recarregar(); }, [recarregar]);
  return { categorias, contas, carregando, erro, recarregar };
}
