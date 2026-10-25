import { createContext, useContext, useState } from 'react';
import { mesAtual } from './utils/format.js';

// Mês de referência compartilhado entre as telas (equivale à célula "Mês de referência" da aba Resumo).
const MesContext = createContext(null);
export const useMes = () => useContext(MesContext);

export function MesProvider({ children }) {
  const [mes, setMes] = useState(mesAtual());
  return <MesContext.Provider value={{ mes, setMes }}>{children}</MesContext.Provider>;
}
