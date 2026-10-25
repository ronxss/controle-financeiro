import { useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip, IconButton, List, ListItem, ListItemText, Snackbar, Stack, Tab, Tabs, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { api } from '../api.js';
import { useCadastros } from '../hooks.js';
import NomeDialog from '../components/NomeDialog.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';

/** Equivale à aba "Listas" da planilha: categorias e contas editáveis. */
export default function Cadastros() {
  const { categorias, contas, erro: erroCarga, recarregar } = useCadastros();
  const [aba, setAba] = useState(0);
  const [dialog, setDialog] = useState({ aberto: false, item: null });
  const [excluir, setExcluir] = useState(null);
  const [erro, setErro] = useState('');
  const [msg, setMsg] = useState('');

  const ehCategoria = aba === 0;
  const base = ehCategoria ? '/api/categorias' : '/api/contas';
  const rotulo = ehCategoria ? 'categoria' : 'conta';

  const salvar = async ({ nome, tipo }) => {
    const corpo = ehCategoria ? { nome, tipo } : { nome };
    if (dialog.item) await api.put(`${base}/${dialog.item.id}`, corpo);
    else await api.post(base, corpo);
    await recarregar();
    setMsg('Salvo com sucesso.');
  };

  const confirmarExclusao = async () => {
    try {
      await api.delete(`${base}/${excluir.id}`);
      setMsg('Excluído com sucesso.');
      await recarregar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setExcluir(null);
    }
  };

  const linha = (item, extra) => (
    <ListItem
      key={item.id} divider
      secondaryAction={
        <>
          <IconButton aria-label="Editar" onClick={() => setDialog({ aberto: true, item })}><EditIcon fontSize="small" /></IconButton>
          <IconButton aria-label="Excluir" onClick={() => setExcluir(item)}><DeleteIcon fontSize="small" /></IconButton>
        </>
      }
    >
      <ListItemText primary={item.nome} />
      {extra}
    </ListItem>
  );

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h5" fontWeight={700}>Cadastros</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog({ aberto: true, item: null })}>
          Nova {rotulo}
        </Button>
      </Stack>

      {(erro || erroCarga) && <Alert severity="error" onClose={() => setErro('')}>{erro || erroCarga}</Alert>}

      <Tabs value={aba} onChange={(_, v) => setAba(v)}>
        <Tab label="Categorias" />
        <Tab label="Contas" />
      </Tabs>

      <Card>
        <CardContent>
          {ehCategoria ? (
            ['Despesa', 'Receita'].map((t) => (
              <Box key={t} sx={{ mb: 2 }}>
                <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>
                  {t === 'Despesa' ? 'Despesas' : 'Receitas'}
                </Typography>
                <List disablePadding>
                  {categorias.filter((c) => c.tipo === t).map((c) =>
                    linha(c, <Chip size="small" label={t} color={t === 'Receita' ? 'success' : 'error'} variant="outlined" sx={{ mr: 10 }} />)
                  )}
                </List>
              </Box>
            ))
          ) : (
            <List disablePadding>{contas.map((c) => linha(c))}</List>
          )}
        </CardContent>
      </Card>

      <NomeDialog
        open={dialog.aberto} comTipo={ehCategoria}
        titulo={`${dialog.item ? 'Editar' : 'Nova'} ${rotulo}`}
        valorInicial={dialog.item} onClose={() => setDialog({ aberto: false, item: null })} onSalvar={salvar}
      />
      <ConfirmDialog
        open={Boolean(excluir)} titulo={`Excluir ${rotulo}?`}
        texto={excluir ? `“${excluir.nome}” será removida. Só é possível excluir itens sem lançamentos.` : ''}
        onConfirmar={confirmarExclusao} onCancelar={() => setExcluir(null)}
      />
      <Snackbar open={Boolean(msg)} autoHideDuration={3000} onClose={() => setMsg('')} message={msg} />
    </Stack>
  );
}
