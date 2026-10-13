// Sleep dial: bedtime and wake-up picker on a 24 hour clock. Drag the moon, the sun, or the arc.
import { z, toTime, toMin } from '../util.js';
import { icon, ICONS, SUN } from './common.js';

const DIAL = { c: 120, r: 90 };
const dialPt = (min, r = DIAL.r) => { const a = min / 1440 * 2 * Math.PI - Math.PI / 2; return [DIAL.c + r * Math.cos(a), DIAL.c + r * Math.sin(a)]; };
const asleep = (b, w) => (w - b + 1440) % 1440;
export const fmtDur = m => `${Math.floor(m / 60)}h ${z(m % 60)}m`;

function dialArc(b, w) {
  const d = asleep(b, w);
  if (!d) return '';
  const [x1, y1] = dialPt(b), [x2, y2] = dialPt(w);
  return `M ${x1} ${y1} A ${DIAL.r} ${DIAL.r} 0 ${d > 720 ? 1 : 0} 1 ${x2} ${y2}`;
}

export function sleepDialHtml(bed, wake) {
  const b = toMin(bed), w = toMin(wake);
  const ticks = Array.from({ length: 24 }, (_, h) => {
    const [x1, y1] = dialPt(h * 60, 72), [x2, y2] = dialPt(h * 60, h % 6 ? 68 : 64);
    return `<line class="${h % 6 ? '' : 'maj'}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  }).join('');
  const labels = [0, 3, 6, 9, 12, 15, 18, 21].map(h => { const [x, y] = dialPt(h * 60, 55); return `<text class="sd-lbl" x="${x}" y="${y}">${z(h)}</text>`; }).join('');
  const knob = (k, m, label, paths) => {
    const [x, y] = dialPt(m);
    return `<g class="sd-knob" data-k="${k}" tabindex="0" role="slider" aria-label="${label}" transform="translate(${x} ${y})"><circle r="16"/><svg class="kic" x="-9" y="-9" width="18" height="18" viewBox="0 0 24 24">${paths}</svg></g>`;
  };
  return `<div class="sdial">
    <div class="sd-times">
      <div class="sd-t bed"><span>${icon('sleep')}Bedtime</span><b data-out="bed">${toTime(b)}</b></div>
      <div class="sd-t wake"><span><svg class="ic" viewBox="0 0 24 24">${SUN}</svg>Wake up</span><b data-out="wake">${toTime(w)}</b></div>
    </div>
    <svg class="sd-svg" viewBox="0 0 240 240">
      <circle class="sd-track" cx="120" cy="120" r="${DIAL.r}"/>
      <g class="sd-ticks">${ticks}</g>${labels}
      <path class="sd-arc" d="${dialArc(b, w)}"/>
      ${knob('bed', b, 'Bedtime', ICONS.sleep)}${knob('wake', w, 'Wake up', SUN)}
      <text class="sd-dur" x="120" y="116">${fmtDur(asleep(b, w))}</text>
      <text class="sd-sub" x="120" y="137">time asleep</text>
    </svg>
    <input type="hidden" name="bed" value="${toTime(b)}"><input type="hidden" name="wake" value="${toTime(w)}">
    <div class="muted small sd-hint">Drag the moon and the sun. Drag the arc to move both.</div>
  </div>`;
}

function setDial(dial, bedMin, wakeMin) {
  const snap = m => ((Math.round(m / 5) * 5) % 1440 + 1440) % 1440;
  const b = snap(bedMin), w = snap(wakeMin);
  for (const [k, m] of [['bed', b], ['wake', w]]) {
    dial.querySelector(`[name=${k}]`).value = toTime(m);
    dial.querySelector(`[data-out=${k}]`).textContent = toTime(m);
    const [x, y] = dialPt(m);
    dial.querySelector(`.sd-knob[data-k=${k}]`).setAttribute('transform', `translate(${x} ${y})`);
  }
  dial.querySelector('.sd-arc').setAttribute('d', dialArc(b, w));
  dial.querySelector('.sd-dur').textContent = fmtDur(asleep(b, w));
}
function pointerMin(svg, e) {
  const r = svg.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width * 240 - DIAL.c, y = (e.clientY - r.top) / r.height * 240 - DIAL.c;
  let a = Math.atan2(y, x) + Math.PI / 2;
  if (a < 0) a += 2 * Math.PI;
  return a / (2 * Math.PI) * 1440;
}
const dialTimes = dial => [toMin(dial.querySelector('[name=bed]').value), toMin(dial.querySelector('[name=wake]').value)];

let dialDrag = null, justDragged = false;
// releasing a dial drag over the backdrop must not close the form
export const wasJustDragged = () => justDragged;

export function installDial() {
  document.addEventListener('pointerdown', e => {
    const part = e.target.closest('.sd-knob, .sd-arc');
    if (!part) return;
    e.preventDefault();
    const dial = part.closest('.sdial'), svg = dial.querySelector('.sd-svg'), [b, w] = dialTimes(dial);
    if (part.classList.contains('sd-knob')) part.focus();
    dialDrag = { dial, svg, k: part.dataset.k || 'both', start: pointerMin(svg, e), b, w };
    dial.classList.add('dragging');
  });
  document.addEventListener('pointermove', e => {
    if (!dialDrag) return;
    const { dial, svg, k, start, b, w } = dialDrag, m = pointerMin(svg, e);
    if (k === 'bed') setDial(dial, m, w);
    else if (k === 'wake') setDial(dial, b, m);
    else setDial(dial, b + m - start, w + m - start);
  });
  const endDialDrag = () => {
    if (!dialDrag) return;
    dialDrag.dial.classList.remove('dragging');
    dialDrag = null;
    justDragged = true;
    setTimeout(() => { justDragged = false; }, 0);
  };
  document.addEventListener('pointerup', endDialDrag);
  document.addEventListener('pointercancel', endDialDrag);
  document.addEventListener('keydown', e => {
    const knob = e.target.closest?.('.sd-knob');
    const dir = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key];
    if (!knob || !dir) return;
    e.preventDefault();
    const dial = knob.closest('.sdial'), [b, w] = dialTimes(dial), step = dir * (e.shiftKey ? 60 : 5);
    if (knob.dataset.k === 'bed') setDial(dial, b + step, w); else setDial(dial, b, w + step);
  });
}
