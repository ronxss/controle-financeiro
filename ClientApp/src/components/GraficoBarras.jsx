import { useTheme } from '@mui/material/styles';
import { brl, rotuloMesCurto } from '../utils/format.js';

/**
 * Barras agrupadas (receitas x despesas) por mês, em SVG puro: sem biblioteca, escala com a largura da tela.
 * `dados`: [{ mes: 'aaaa-mm', receitas, despesas }]. O mês selecionado (último) fica em destaque.
 */
export default function GraficoBarras({ dados }) {
  const t = useTheme();
  const L = 340, A = 170, base = A - 28, topo = 14, margem = 8;
  const maximo = Math.max(1, ...dados.flatMap((d) => [d.receitas, d.despesas]));
  const largGrupo = (L - margem * 2) / dados.length;
  const largBarra = Math.min(18, largGrupo / 2 - 4);
  const altura = (v) => Math.max(v > 0 ? 2 : 0, (v / maximo) * (base - topo));

  const descricao = dados
    .map((d) => `${rotuloMesCurto(d.mes)}: receitas ${brl(d.receitas)}, despesas ${brl(d.despesas)}`)
    .join('; ');

  return (
    <svg viewBox={`0 0 ${L} ${A}`} width="100%" role="img" aria-label={`Receitas e despesas pagas nos últimos 6 meses. ${descricao}`}
      style={{ display: 'block', maxHeight: 240 }}>
      <line x1={margem} x2={L - margem} y1={base} y2={base} stroke={t.palette.divider} />
      {dados.map((d, i) => {
        const cx = margem + largGrupo * i + largGrupo / 2;
        const atual = i === dados.length - 1;
        const hr = altura(d.receitas);
        const hd = altura(d.despesas);
        return (
          <g key={d.mes} opacity={atual ? 1 : 0.6}>
            <rect x={cx - largBarra - 1} y={base - hr} width={largBarra} height={hr} rx={2} fill={t.palette.success.main}>
              <title>{`${rotuloMesCurto(d.mes)} · receitas ${brl(d.receitas)}`}</title>
            </rect>
            <rect x={cx + 1} y={base - hd} width={largBarra} height={hd} rx={2} fill={t.palette.error.main}>
              <title>{`${rotuloMesCurto(d.mes)} · despesas ${brl(d.despesas)}`}</title>
            </rect>
            <text x={cx} y={A - 10} textAnchor="middle" fontSize="10" fill={t.palette.text.secondary} fontWeight={atual ? 700 : 400}>
              {rotuloMesCurto(d.mes)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
