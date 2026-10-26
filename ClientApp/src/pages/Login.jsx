import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Divider, IconButton, InputAdornment, Stack, Tab, Tabs, TextField, Typography,
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import { useAuth } from '../auth/AuthContext.jsx';
import { api } from '../api.js';
import GoogleButton from '../components/GoogleButton.jsx';

export default function Login() {
  const { entrar, registrar, entrarComGoogle } = useAuth();
  const [googleClientId, setGoogleClientId] = useState(null);
  const [aba, setAba] = useState(0); // 0 = entrar, 1 = criar conta
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrar, setMostrar] = useState(false);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  const novo = aba === 1;

  // O servidor informa o Client ID do Google; se não estiver configurado, o botão simplesmente não aparece.
  useEffect(() => {
    api.get('/api/auth/config').then((c) => setGoogleClientId(c?.googleClientId || null)).catch(() => {});
  }, []);

  const aoReceberGoogle = async (credential) => {
    setErro('');
    try {
      await entrarComGoogle(credential);
    } catch (err) {
      setErro(err.message);
    }
  };

  const enviar = async (e) => {
    e.preventDefault();
    setErro('');
    if (novo && nome.trim().length < 2) return setErro('Informe seu nome.');
    if (novo && senha.length < 8) return setErro('A senha deve ter pelo menos 8 caracteres.');
    setEnviando(true);
    try {
      if (novo) await registrar(nome.trim(), email.trim(), senha);
      else await entrar(email.trim(), senha);
    } catch (err) {
      setErro(err.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 2 }}>
      <Card sx={{ width: '100%', maxWidth: 420 }}>
        <CardContent sx={{ p: 3 }}>
          <Stack alignItems="center" spacing={1} sx={{ mb: 2 }}>
            <AccountBalanceWalletIcon color="primary" sx={{ fontSize: 48 }} />
            <Typography variant="h5" fontWeight={700}>Controle Financeiro</Typography>
            <Typography variant="body2" color="text.secondary">Suas receitas e despesas em um só lugar</Typography>
          </Stack>

          <Tabs value={aba} onChange={(_, v) => { setAba(v); setErro(''); }} variant="fullWidth" sx={{ mb: 2 }}>
            <Tab label="Entrar" />
            <Tab label="Criar conta" />
          </Tabs>

          <Box component="form" onSubmit={enviar} noValidate>
            <Stack spacing={2}>
              {erro && <Alert severity="error">{erro}</Alert>}
              {novo && (
                <TextField label="Nome" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" required />
              )}
              <TextField label="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                autoComplete="email" required autoFocus />
              <TextField
                label="Senha" type={mostrar ? 'text' : 'password'} value={senha} onChange={(e) => setSenha(e.target.value)}
                autoComplete={novo ? 'new-password' : 'current-password'} required
                helperText={novo ? 'Mínimo de 8 caracteres, com letra maiúscula, minúscula e número.' : undefined}
                slotProps={{
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton aria-label={mostrar ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setMostrar((v) => !v)} edge="end">
                          {mostrar ? <VisibilityOffIcon /> : <VisibilityIcon />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
              />
              <Button type="submit" variant="contained" size="large" disabled={enviando || !email || !senha}>
                {novo ? 'Criar conta' : 'Entrar'}
              </Button>
            </Stack>
          </Box>

          {googleClientId && (
            <>
              <Divider sx={{ my: 2.5 }}>ou</Divider>
              <GoogleButton clientId={googleClientId} onCredential={aoReceberGoogle} onErro={setErro} />
            </>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
