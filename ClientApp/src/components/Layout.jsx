import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AppBar, Avatar, BottomNavigation, BottomNavigationAction, Box, Divider, Drawer, IconButton, List,
  ListItemButton, ListItemIcon, ListItemText, Menu, MenuItem, Paper, Toolbar, Tooltip, Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DashboardIcon from '@mui/icons-material/Dashboard';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import SavingsIcon from '@mui/icons-material/Savings';
import TuneIcon from '@mui/icons-material/Tune';
import LogoutIcon from '@mui/icons-material/Logout';
import LockResetIcon from '@mui/icons-material/LockReset';
import { useAuth } from '../auth/AuthContext.jsx';
import { useMes } from '../MesContext.jsx';
import { mesAtual, moverMes, rotuloMes } from '../utils/format.js';
import SenhaDialog from './SenhaDialog.jsx';

const LARGURA = 220;
const ITENS = [
  { caminho: '/', rotulo: 'Resumo', icone: <DashboardIcon /> },
  { caminho: '/lancamentos', rotulo: 'Lançamentos', icone: <ReceiptLongIcon /> },
  { caminho: '/orcamento', rotulo: 'Orçamento', icone: <SavingsIcon /> },
  { caminho: '/cadastros', rotulo: 'Cadastros', icone: <TuneIcon /> },
];

export default function Layout({ children }) {
  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up('md'));
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { usuario, sair } = useAuth();
  const { mes, setMes } = useMes();
  const [ancora, setAncora] = useState(null);
  const [senhaAberta, setSenhaAberta] = useState(false);

  const atual = ITENS.findIndex((i) => i.caminho === pathname);

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar position="fixed" elevation={0} sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}>
        <Toolbar sx={{ gap: 1 }}>
          <Typography variant="h6" fontWeight={700} sx={{ display: { xs: 'none', sm: 'block' }, mr: 2 }}>
            Controle Financeiro
          </Typography>

          <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <IconButton color="inherit" aria-label="Mês anterior" onClick={() => setMes(moverMes(mes, -1))}>
              <ChevronLeftIcon />
            </IconButton>
            <Tooltip title="Voltar ao mês atual">
              <Typography
                onClick={() => setMes(mesAtual())}
                sx={{ minWidth: 150, textAlign: 'center', fontWeight: 500, cursor: 'pointer', userSelect: 'none' }}
              >
                {rotuloMes(mes)}
              </Typography>
            </Tooltip>
            <IconButton color="inherit" aria-label="Próximo mês" onClick={() => setMes(moverMes(mes, 1))}>
              <ChevronRightIcon />
            </IconButton>
          </Box>

          <IconButton onClick={(e) => setAncora(e.currentTarget)} aria-label="Menu do usuário">
            <Avatar sx={{ width: 34, height: 34, bgcolor: 'secondary.main', fontSize: 16 }}>
              {usuario.nome.charAt(0).toUpperCase()}
            </Avatar>
          </IconButton>
          <Menu anchorEl={ancora} open={Boolean(ancora)} onClose={() => setAncora(null)}>
            <Box sx={{ px: 2, py: 1 }}>
              <Typography fontWeight={500}>{usuario.nome}</Typography>
              <Typography variant="body2" color="text.secondary">{usuario.email}</Typography>
            </Box>
            <Divider />
            {usuario.temSenha && (
              <MenuItem onClick={() => { setAncora(null); setSenhaAberta(true); }}>
                <ListItemIcon><LockResetIcon fontSize="small" /></ListItemIcon>Alterar senha
              </MenuItem>
            )}
            <MenuItem onClick={() => { setAncora(null); sair(); }}>
              <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>Sair
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      {desktop && (
        <Drawer
          variant="permanent"
          sx={{ width: LARGURA, flexShrink: 0, '& .MuiDrawer-paper': { width: LARGURA, boxSizing: 'border-box' } }}
        >
          <Toolbar />
          <List sx={{ p: 1 }}>
            {ITENS.map((i) => (
              <ListItemButton
                key={i.caminho}
                selected={pathname === i.caminho}
                onClick={() => navigate(i.caminho)}
                sx={{ borderRadius: 2, mb: 0.5 }}
              >
                <ListItemIcon sx={{ minWidth: 40 }}>{i.icone}</ListItemIcon>
                <ListItemText primary={i.rotulo} />
              </ListItemButton>
            ))}
          </List>
        </Drawer>
      )}

      <Box component="main" sx={{ flex: 1, minWidth: 0, p: { xs: 2, md: 3 }, pb: { xs: 12, md: 3 } }}>
        <Toolbar />
        <Box sx={{ maxWidth: 1100, mx: 'auto' }}>{children}</Box>
      </Box>

      {!desktop && (
        <Paper sx={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: (t) => t.zIndex.appBar }} elevation={8}>
          <BottomNavigation showLabels value={atual === -1 ? 0 : atual} onChange={(_, v) => navigate(ITENS[v].caminho)}>
            {ITENS.map((i) => (
              <BottomNavigationAction key={i.caminho} label={i.rotulo} icon={i.icone} />
            ))}
          </BottomNavigation>
        </Paper>
      )}

      <SenhaDialog open={senhaAberta} onClose={() => setSenhaAberta(false)} />
    </Box>
  );
}
