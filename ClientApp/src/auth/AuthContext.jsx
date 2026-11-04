import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';
import { MODO_LOCAL } from '../modo.js';
import { solicitarPersistencia } from '../local/armazenamento.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

// No modo local não há conta nem login: os dados pertencem a quem tem o aparelho.
const USUARIO_LOCAL = { nome: 'Meus dados', email: 'Salvos neste aparelho', temSenha: false };

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(MODO_LOCAL ? USUARIO_LOCAL : null);
  const [carregando, setCarregando] = useState(!MODO_LOCAL);

  useEffect(() => {
    if (MODO_LOCAL) {
      solicitarPersistencia(); // pede ao navegador para não apagar os dados sozinho
      return undefined;
    }

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

  const entrarComGoogle = useCallback(async (credential) => {
    setUsuario(await api.post('/api/auth/google', { credential }));
  }, []);

  const sair = useCallback(async () => {
    try { await api.post('/api/auth/sair'); } finally { setUsuario(null); }
  }, []);

  return (
    <AuthContext.Provider value={{ usuario, carregando, entrar, registrar, entrarComGoogle, sair }}>
      {children}
    </AuthContext.Provider>
  );
}
