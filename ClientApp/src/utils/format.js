const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const brl = (v) => moeda.format(v ?? 0);

const pad = (n) => String(n).padStart(2, '0');

/** 'aaaa-mm-dd' -> 'dd/mm/aaaa' (sem passar por Date, evitando problemas de fuso). */
export const dataBR = (iso) => (iso ? iso.split('-').reverse().join('/') : '');

export const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const mesAtual = () => hojeISO().slice(0, 7);

export const moverMes = (mes, delta) => {
  const [a, m] = mes.split('-').map(Number);
  const d = new Date(a, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};

export const rotuloMes = (mes) => {
  const [a, m] = mes.split('-').map(Number);
  const texto = new Date(a, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
};

/** Data padrão para novo lançamento: hoje, se for o mês exibido; senão, dia 1 do mês exibido. */
export const dataPadrao = (mes) => (hojeISO().startsWith(mes) ? hojeISO() : `${mes}-01`);

/** Converte texto digitado ("1.234,56" ou "12.5") em número; NaN se inválido. */
export const parseValor = (texto) => {
  const t = String(texto).trim().replace(/\s/g, '');
  if (!t) return NaN;
  const normalizado = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  return /^\d+(\.\d{1,2})?$/.test(normalizado) ? Number(normalizado) : NaN;
};

