import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControlLabel, MenuItem,
  Stack, Switch, TextField, Typography, useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { api } from '../api.js';
import { ehAparelho, erroBackupAutomatico, permitirNotificacoes } from '../local/servicosAparelho.js';

const ANTECEDENCIAS = [
  { v: 0, t: 'Só no dia do vencimento' }, { v: 1, t: '1 dia antes e no dia' }, { v: 2, t: '2 dias antes e no dia' },
  { v: 3, t: '3 dias antes e no dia' }, { v: 5, t: '5 dias antes e no dia' }, { v: 7, t: '7 dias antes e no dia' },
];
const HORAS = Array.from({ length: 17 }, (_, i) => i + 6); // 06h a 22h

function textoUltimo(backup) {
  if (!backup?.ultimo) return 'Nenhum backup registrado neste aparelho.';
  if (backup.diasDesde === 0) return 'Último backup: hoje.';
  if (backup.diasDesde === 1) return 'Último backup: ontem.';
  return `Último backup: há ${backup.diasDesde} dias.`;
}

/** Configurações do modo local: lembretes de vencimento (APK) e backup. Cada mudança é salva na hora. */
export default function ConfigAparelhoDialog({ open, onClose, onExportar }) {
  const celular = useMediaQuery(useTheme().breakpoints.down('sm'));
  const aparelho = ehAparelho();
  const [cfg, setCfg] = useState(null);
  const [backup, setBackup] = useState(null);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  const carregar = () => {
    Promise.all([api.get('/api/config'), api.get('/api/lembretes')])
      .then(([c, l]) => { setCfg(c); setBackup(l.backup); setErro(''); })
      .catch((e) => setErro(e.message));
  };
  useEffect(() => { if (open) { setCfg(null); carregar(); } }, [open]);

  const salvar = async (parcial) => {
    setSalvando(true);
    setErro('');
    try {
      setCfg(await api.put('/api/config', parcial));
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  const alternarLembretes = async (ligar) => {
    if (ligar && !(await permitirNotificacoes())) {
      setErro('O Android não permitiu notificações. Libere em Configurações > Apps > Controle Financeiro > Notificações e tente de novo.');
      return;
    }
    salvar({ lembretes: { ativo: ligar } });
  };

  const exportar = async () => {
    await onExportar();
    carregar();
  };

  const l = cfg?.lembretes;
  const falhaAuto = aparelho ? erroBackupAutomatico() : '';

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" fullScreen={celular}>
      <DialogTitle>Lembretes e backup</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 0.5 }}>
          {erro && <Alert severity="error" onClose={() => setErro('')}>{erro}</Alert>}
          {!cfg && !erro && <Typography color="text.secondary">Carregando…</Typography>}

          {cfg && (
            <>
              <Box>
                <Typography variant="subtitle1" fontWeight={500}>Lembretes de vencimento</Typography>
                {!aparelho && (
                  <Alert severity="info" sx={{ mt: 1 }}>
                    Notificações funcionam no app Android (APK). Aqui no navegador, contas a vencer e atrasadas aparecem
                    como avisos na tela Resumo.
                  </Alert>
                )}
                <FormControlLabel
                  sx={{ mt: 1 }} disabled={!aparelho || salvando}
                  control={<Switch checked={aparelho && l.ativo} onChange={(e) => alternarLembretes(e.target.checked)} />}
                  label="Avisar sobre receitas e despesas pendentes"
                />
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 1.5 }}>
                  <TextField
                    select fullWidth size="small" label="Quando avisar" value={l.diasAntes}
                    disabled={!aparelho || !l.ativo || salvando}
                    onChange={(e) => salvar({ lembretes: { diasAntes: Number(e.target.value) } })}
                  >
                    {ANTECEDENCIAS.map((a) => <MenuItem key={a.v} value={a.v}>{a.t}</MenuItem>)}
                  </TextField>
                  <TextField
                    select size="small" label="Horário" value={l.hora} sx={{ minWidth: 120 }}
                    disabled={!aparelho || !l.ativo || salvando}
                    onChange={(e) => salvar({ lembretes: { hora: Number(e.target.value) } })}
                  >
                    {HORAS.map((h) => <MenuItem key={h} value={h}>{String(h).padStart(2, '0')}:00</MenuItem>)}
                  </TextField>
                </Stack>
                <FormControlLabel
                  sx={{ mt: 1 }} disabled={!aparelho || !l.ativo || salvando}
                  control={<Switch checked={l.detalhes} onChange={(e) => salvar({ lembretes: { detalhes: e.target.checked } })} />}
                  label="Mostrar descrição e valor na notificação"
                />
                <Typography variant="caption" color="text.secondary" component="p">
                  Desligado, a notificação só diz que há uma conta a vencer — mais discreto na tela de bloqueio.
                </Typography>
              </Box>

              <Divider />

              <Box>
                <Typography variant="subtitle1" fontWeight={500}>Backup</Typography>
                <Typography color={backup?.atrasado ? 'warning.main' : 'text.secondary'} sx={{ mt: 0.5 }}>
                  {textoUltimo(backup)}
                </Typography>
                <Button variant="outlined" sx={{ mt: 1 }} onClick={exportar}>Exportar backup agora</Button>

                {aparelho && (
                  <>
                    <FormControlLabel
                      sx={{ mt: 2, display: 'flex' }} disabled={salvando}
                      control={<Switch checked={cfg.backup.automatico} onChange={(e) => salvar({ backup: { automatico: e.target.checked } })} />}
                      label="Backup automático semanal"
                    />
                    <Typography variant="caption" color="text.secondary" component="p">
                      Uma cópia por semana em Documentos/Controle Financeiro (ficam as 4 mais recentes), feita quando você
                      usa o app. O arquivo não é criptografado. Se o celular for perdido ou formatado, essas cópias também
                      se perdem: de vez em quando, envie uma para o Drive ou e-mail com “Exportar backup”.
                    </Typography>
                    {falhaAuto && <Alert severity="warning" sx={{ mt: 1 }}>O último backup automático falhou: {falhaAuto}</Alert>}
                  </>
                )}
              </Box>
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 'max(16px, env(safe-area-inset-bottom))' }}>
        <Button onClick={onClose}>Fechar</Button>
      </DialogActions>
    </Dialog>
  );
}
