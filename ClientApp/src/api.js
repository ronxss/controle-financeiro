// Cliente HTTP. O cookie de sessão (HttpOnly) é enviado automaticamente;
// o cabeçalho X-Requested-With é exigido pelo servidor em requisições que alteram dados (proteção CSRF).

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

function extrairMensagem(data, status) {
  if (data?.mensagem) return data.mensagem;
  if (data?.errors && typeof data.errors === 'object') {
    const primeira = Object.values(data.errors).flat()[0];
    if (primeira) return primeira;
  }
  if (status === 429) return 'Muitas tentativas. Aguarde um instante e tente novamente.';
  if (status === 401) return 'Sessão expirada. Entre novamente.';
  if (status >= 500) return 'Erro no servidor. Tente novamente em instantes.';
  return data?.title || 'Não foi possível concluir a operação.';
}

async function request(method, url, body) {
  let res;
  try {
    res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Não foi possível conectar ao servidor.', 0);
  }

  const texto = await res.text();
  let data = null;
  if (texto) {
    try { data = JSON.parse(texto); } catch { /* resposta sem JSON */ }
  }

  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/api/auth/')) {
      window.dispatchEvent(new Event('auth:expirou'));
    }
    throw new ApiError(extrairMensagem(data, res.status), res.status);
  }
  return data;
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body) => request('POST', url, body ?? {}),
  put: (url, body) => request('PUT', url, body),
  patch: (url, body) => request('PATCH', url, body),
  delete: (url) => request('DELETE', url),
};
