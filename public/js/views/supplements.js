import { S, view, supColor } from '../state.js';
import { WD, dayLabel, esc, lastNDays, parseDay, today, uniq } from '../util.js';
import { addBtn, secHead } from '../ui/common.js';
import { streak, supChecklist } from '../ui/checks.js';

function supHeatmap() {
  const days = lastNDays(view.supRange), regularNames = S.regulars.map(r => r.name);
  const extra = uniq(S.supplements.filter(x => x.date >= days[0] && !regularNames.includes(x.supplement)).map(x => x.supplement));
  const rows = [...regularNames, ...extra];
  if (!rows.length) return '<p class="empty">Nothing logged yet.</p>';
  const taken = new Set(S.supplements.map(x => x.date + '|' + x.supplement));
  const head = days.map(d => {
    const dt = parseDay(d);
    return `<div class="hm-day ${d === today() ? 'today' : ''} ${dt.getDay() === 1 ? 'mon' : ''}"><span>${WD[dt.getDay()].slice(0, 2)}</span><b>${dt.getDate()}</b></div>`;
  }).join('');
  const body = rows.map(name => {
    const r = S.regulars.find(x => x.name === name), n = days.filter(d => taken.has(d + '|' + name)).length;
    const cells = days.map(d => {
      const on = taken.has(d + '|' + name);
      return `<button class="hm-cell ${on ? 'on' : ''} ${d === today() ? 'today' : ''}" data-act="sup-cell" data-name="${esc(name)}" data-date="${d}" title="${esc(name)}, ${dayLabel(d)}: ${on ? 'taken' : 'not taken'}"></button>`;
    }).join('');
    return `<div class="hm-name" style="--c:${supColor(name)}"><b><i class="cdot"></i><span class="nm">${esc(name)}</span></b><span>${r ? `${esc(r.dose)} ${esc(r.unit)}` : 'one-off'}</span></div>
      <div class="hm-cells" style="--c:${supColor(name)}">${cells}</div>
      <div class="hm-rate"><b>${Math.round(n / days.length * 100)}%</b><span>${n}/${days.length} days</span></div>`;
  }).join('');
  return `<div class="hm-scroll"><div class="hm" style="--n:${days.length}"><div class="hm-name hm-corner"></div><div class="hm-cells">${head}</div><div></div>${body}</div></div>`;
}

export function renderSupplements() {
  const seg = [14, 28].map(n => `<button class="${view.supRange === n ? 'on' : ''}" data-act="sup-range" data-n="${n}">${n / 7} weeks</button>`).join('');
  return secHead('Supplements', 'Tick your regulars, or add a one-off entry.', addBtn('supplements', '+ Add entry')) + `
    <div class="grid2">
      <div class="card"><h3>Today</h3><div class="checks sup-checks">${supChecklist()}</div></div>
      <div class="card sup-streaks"><h3>Streaks</h3>${S.regulars.length ? `<table><tbody>${S.regulars.map(r => `<tr><td><i class="cdot" style="background:${supColor(r.name)};display:inline-block;margin-right:8px"></i>${esc(r.name)}</td><td style="text-align:right"><b>${streak(r.name)}</b> <span class="muted">${streak(r.name) === 1 ? 'day' : 'days'} in a row</span></td></tr>`).join('')}</tbody></table>` : '<p class="empty">No regular supplements yet.</p>'}</div>
    </div>
    <div class="card">
      <div class="card-head"><div><h3>History</h3><div class="muted small">Tap a square to mark that day as taken or not taken.</div></div><div class="seg">${seg}</div></div>
      ${supHeatmap()}
    </div>`;
}
