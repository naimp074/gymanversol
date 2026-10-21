import { useState } from 'react';

// Colores de series validados (modo claro, superficie #fffcf8). El orden es fijo: no reasignar por ranking.
export const SERIES = { cuotas: '#e0603f', ventas: '#3b6ea8', otros: '#1baf7a' };
export const INK = '#3a342e';

const compact = value => {
  const abs = Math.abs(value);
  if (abs >= 1e6) return `${(value / 1e6).toLocaleString('es-AR', { maximumFractionDigits: 1 })} M`;
  if (abs >= 1e3) return `${(value / 1e3).toLocaleString('es-AR', { maximumFractionDigits: 0 })} k`;
  return value.toLocaleString('es-AR');
};
export const compactMoney = value => `$${compact(value)}`;

function niceStep(range, count = 4) {
  const raw = Math.max(range, 1) / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map(m => m * power).find(s => s >= raw);
}

// Barra con el extremo opuesto a la base redondeado (4px), anclada a la base.
function barPath(x, from, to, width) {
  const h = Math.abs(to - from);
  const r = Math.min(4, width / 2, h);
  if (h < 0.5) return '';
  if (to < from) return `M${x},${from}V${to + r}Q${x},${to} ${x + r},${to}H${x + width - r}Q${x + width},${to} ${x + width},${to + r}V${from}Z`;
  return `M${x},${from}V${to - r}Q${x},${to} ${x + r},${to}H${x + width - r}Q${x + width},${to} ${x + width},${to - r}V${from}Z`;
}

export function Legend({ series, totals, format }) {
  return <div className="viz-legend">{series.map(s => <span key={s.key}><i style={{ background: s.color }}></i>{s.label}{totals && <b>{format(totals[s.key] || 0)}</b>}</span>)}</div>;
}

/**
 * Columnas por período. data: [{ key, label, long, values: { serie: número } }].
 * Con varias series se apilan; una serie admite negativos (debajo de la base).
 */
export function ColumnChart({ data, series, format, axisFormat = format, height = 230, label, table = true }) {
  const [hover, setHover] = useState(null);
  const W = 720, H = height, left = 52, right = 8, top = 14, bottom = 28;
  const positive = data.map(d => series.reduce((s, se) => s + Math.max(0, d.values[se.key] || 0), 0));
  const negative = data.map(d => series.reduce((s, se) => s + Math.min(0, d.values[se.key] || 0), 0));
  const step = niceStep(Math.max(...positive, 0) - Math.min(...negative, 0) || 1);
  const max = Math.max(step, Math.ceil(Math.max(...positive, 0) / step) * step);
  const min = Math.floor(Math.min(...negative, 0) / step) * step;
  const y = v => top + (max - v) / (max - min) * (H - top - bottom);
  const slot = (W - left - right) / data.length;
  const barW = Math.min(34, slot * 0.58);
  const ticks = [];
  for (let v = min; v <= max + 1e-9; v += step) ticks.push(v);
  const every = data.length > 14 ? Math.ceil(data.length / 12) : 1;
  const h = hover !== null ? data[hover] : null;

  return <div className="viz">
    <div className="viz-plot" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {ticks.map(v => <g key={v}>
          <line x1={left} x2={W - right} y1={y(v)} y2={y(v)} className={v === 0 ? 'viz-base' : 'viz-grid'} />
          <text x={left - 8} y={y(v) + 4} textAnchor="end" className="viz-axis">{axisFormat(v)}</text>
        </g>)}
        {data.map((d, i) => {
          const x = left + slot * i + (slot - barW) / 2;
          let up = 0, down = 0;
          return <g key={d.key} className={hover === i ? 'viz-col active' : 'viz-col'}>
            {series.map(se => {
              const v = d.values[se.key] || 0;
              if (!v) return null;
              const from = v > 0 ? up : down;
              const to = from + v;
              if (v > 0) up = to; else down = to;
              const isEnd = v > 0 ? !series.slice(series.indexOf(se) + 1).some(n => (d.values[n.key] || 0) > 0) : true;
              const gap = series.length > 1 && !isEnd ? 2 : 0;
              const y0 = y(from), y1 = y(to) + (v > 0 ? gap : -gap);
              return isEnd ? <path key={se.key} d={barPath(x, y0, y1, barW)} fill={se.color} />
                : <rect key={se.key} x={x} y={Math.min(y0, y1)} width={barW} height={Math.max(0, Math.abs(y1 - y0))} fill={se.color} />;
            })}
            {i % every === 0 && <text x={left + slot * i + slot / 2} y={H - 8} textAnchor="middle" className="viz-axis">{d.label}</text>}
            <rect x={left + slot * i} y={top} width={slot} height={H - top - bottom} fill="transparent" tabIndex={0}
              onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} aria-label={`${d.long || d.label}: ${series.map(se => `${se.label} ${format(d.values[se.key] || 0)}`).join(', ')}`} />
          </g>;
        })}
      </svg>
      {h && <div className="viz-tip" style={{ left: `${(left + slot * (hover + 0.5)) / W * 100}%` }}>
        <span className="viz-tip-title">{h.long || h.label}</span>
        {series.map(se => <span key={se.key} className="viz-tip-row"><i style={{ background: se.color }}></i><b>{format(h.values[se.key] || 0)}</b>{series.length > 1 && <span>{se.label}</span>}</span>)}
        {series.length > 1 && <span className="viz-tip-row total"><b>{format(series.reduce((s, se) => s + (h.values[se.key] || 0), 0))}</b><span>Total</span></span>}
      </div>}
    </div>
    {table && <details className="viz-table"><summary>Ver tabla</summary>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Período</th>{series.map(se => <th key={se.key}>{se.label}</th>)}{series.length > 1 && <th>Total</th>}</tr></thead>
        <tbody>{data.map(d => <tr key={d.key}><td>{d.long || d.label}</td>{series.map(se => <td key={se.key}>{format(d.values[se.key] || 0)}</td>)}{series.length > 1 && <td>{format(series.reduce((s, se) => s + (d.values[se.key] || 0), 0))}</td>}</tr>)}</tbody></table></div>
    </details>}
  </div>;
}

// Ranking horizontal de una sola serie: cada fila muestra su valor, así no depende del color.
export function BarList({ items, format, empty = 'Sin datos en el período.' }) {
  if (!items.length) return <p className="muted viz-empty">{empty}</p>;
  const max = Math.max(...items.map(i => i.value), 1);
  return <div className="viz-bars">{items.map(item => <div key={item.label} className="viz-bar-row" title={`${item.label}: ${format(item.value)}${item.detail ? ` · ${item.detail}` : ''}`}>
    <span className="viz-bar-label">{item.label}</span>
    <span className="viz-bar-track"><i style={{ width: `${Math.max(1.5, item.value / max * 100)}%` }}></i></span>
    <span className="viz-bar-value"><b>{format(item.value)}</b>{item.detail && <small>{item.detail}</small>}</span>
  </div>)}</div>;
}
