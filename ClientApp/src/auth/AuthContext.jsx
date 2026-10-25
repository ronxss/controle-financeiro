import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    api.get('/api/auth/eu')
      .then(setUsuario)
      .catch(() => setUsuario(null))
      .finally(() => setCarregando(false));

    const aoExpirar = () => setUsuario(null);
    window.addEventListener('auth:expirou', aoExpirar);
    return () => window.removeEventListener('auth:expirou', aoExpirar);
  }, []);

  const entrar = useCallback(async (email, senha) => {
    setUsuario(await api.post('/api/auth/entrar', { email, senha }));
  }, []);

  const registrar = useCallback(async (nome, email, senha) => {
    setUsuario(await api.post('/api/auth/registrar', { nome, email, senha }));
  }, []);

  const sair = useCallback(async () => {
    try { await api.post('/api/auth/sair'); } finally { setUsuario(null); }
  }, []);

  return (
    <AuthContext.Provider value={{ usuario, carregando, entrar, registrar, sair }}>
      {children}
    </AuthContext.Provider>
  );
}
