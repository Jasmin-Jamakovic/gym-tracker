// Charts drawn as plain SVG, no chart library.
import { esc, round, thousands } from '../util.js';
import { C } from './common.js';

function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v * 1.05)), n = v * 1.05 / p;
  return [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find(s => s >= n) * p;
}
function chartBase(data, goal, wide) {
  const W = wide ? 1200 : 640, H = wide ? 260 : 220, P = { l: 46, r: 14, t: 14, b: 30 };
  const iw = W - P.l - P.r, ih = H - P.t - P.b;
  const max = niceMax(Math.max(goal || 0, ...data.map(d => d.value || 0)));
  const y = v => P.t + ih - (v / max) * ih, bw = iw / Math.max(data.length, 1);
  let s = '';
  for (let i = 0; i <= 4; i++) {
    const v = max * i / 4;
    s += `<line class="gl" x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${P.l - 8}" y="${y(v) + 4}" text-anchor="end">${round(v)}</text>`;
  }
  const step = Math.ceil(data.length / 10);
  data.forEach((d, i) => { if (i % step === 0) s += `<text class="ax" x="${P.l + i * bw + bw / 2}" y="${H - 10}" text-anchor="middle">${esc(d.label)}</text>`; });
  const goalLine = goal ? `<line x1="${P.l}" x2="${W - P.r}" y1="${y(goal)}" y2="${y(goal)}" stroke="#e8eaf0" stroke-opacity=".45" stroke-dasharray="5 5"/><text class="ax" x="${W - P.r}" y="${y(goal) - 6}" text-anchor="end">goal ${round(goal)}</text>` : '';
  return { W, H, P, ih, y, bw, s, goalLine };
}

export function barChart(data, { goal, color = C.blue, unit = '', wide = false } = {}) {
  if (!data.some(d => d.value)) return '<p class="empty">No data yet.</p>';
  const { W, H, P, ih, y, bw, s, goalLine } = chartBase(data, goal, wide);
  const bars = data.map((d, i) => {
    const v = d.value || 0, top = y(v);
    return `<rect x="${P.l + i * bw + bw * 0.18}" y="${top}" width="${bw * 0.64}" height="${Math.max(P.t + ih - top, 0)}" rx="3" fill="${color}"><title>${esc(d.label)}: ${thousands(v)}${unit}</title></rect>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}">${s}${bars}${goalLine}</svg>`;
}

export function lineChart(data, { goal, color = C.blue, unit = '', wide = false } = {}) {
  const pts = data.map((d, i) => ({ ...d, i })).filter(d => d.value != null);
  if (!pts.length) return '<p class="empty">No data yet.</p>';
  const { W, H, P, y, bw, s, goalLine } = chartBase(data, goal, wide);
  const x = i => P.l + i * bw + bw / 2;
  const line = `<polyline fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" points="${pts.map(p => `${x(p.i)},${y(p.value)}`).join(' ')}"/>`;
  const dots = pts.map(p => `<circle cx="${x(p.i)}" cy="${y(p.value)}" r="4" fill="${color}"><title>${esc(p.label)}: ${round(p.value)}${unit}</title></circle>`).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}">${s}${goalLine}${line}${dots}</svg>`;
}
