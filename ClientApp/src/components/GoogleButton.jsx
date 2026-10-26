import { useEffect, useRef } from 'react';
import { Box } from '@mui/material';

// Google Identity Services: o botão é desenhado pelo Google e devolve um ID token (JWT),
// que o servidor valida. Nenhum segredo fica no navegador (o Client ID é público).
const SRC = 'https://accounts.google.com/gsi/client';
let promessaScript;

function carregarScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  promessaScript ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SRC;
    s.async = true;
    s.defer = true;
    s.onload = resolve;
    s.onerror = () => { promessaScript = undefined; reject(new Error('Falha ao carregar o Google.')); };
    document.head.appendChild(s);
  });
  return promessaScript;
}

export default function GoogleButton({ clientId, onCredential, onErro }) {
  const alvo = useRef(null);
  // Mantém sempre os handlers mais recentes sem reinicializar o botão.
  const handlers = useRef({ onCredential, onErro });
  handlers.current = { onCredential, onErro };

  useEffect(() => {
    let cancelado = false;
    carregarScript()
      .then(() => {
        if (cancelado || !alvo.current) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (resp) => handlers.current.onCredential(resp.credential),
        });
        window.google.accounts.id.renderButton(alvo.current, {
          theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', locale: 'pt-BR', width: 320,
        });
      })
      .catch(() => handlers.current.onErro?.('Não foi possível carregar o login do Google. Verifique sua conexão.'));
    return () => { cancelado = true; };
  }, [clientId]);

  return <Box ref={alvo} sx={{ display: 'flex', justifyContent: 'center', minHeight: 44 }} />;
}
