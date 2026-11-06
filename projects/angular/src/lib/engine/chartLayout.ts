import type { ChartSpec } from '../model/types';
import { chartData, compactNumber, niceScale, sliceColor } from './chart';
import { formatValue, type Row } from './expressions';

/** SVG drawing primitives (coordinates in element pixels). */
export type Prim =
  | { t: 'path'; d: string; fill: string; stroke?: string; sw?: number; opacity?: number; title?: string }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: string; sw: number }
  | { t: 'poly'; points: string; stroke: string; sw: number }
  | { t: 'circle'; cx: number; cy: number; r: number; fill: string; stroke: string; sw: number; title?: string }
  | { t: 'text'; x: number; y: number; text: string; anchor: 'start' | 'middle' | 'end'; size: number; weight: number; fill: string };

const GRID = '#e4e4e0';
const AXIS = '#9a9a96';
const MUTED = '#5f5e5a';
const SURFACE_GAP = '#ffffff';

/** Rect with a rounded data end (the end away from the baseline). */
function bar(x: number, y: number, w: number, h: number, end: 'top' | 'bottom' | 'right' | 'left'): string {
  const r = Math.max(0, Math.min(3, w / 2, h / 2));
  const R = (n: number) => +n.toFixed(2);
  switch (end) {
    case 'top':
      return `M${R(x)},${R(y + h)}V${R(y + r)}Q${R(x)},${R(y)} ${R(x + r)},${R(y)}H${R(x + w - r)}Q${R(x + w)},${R(y)} ${R(x + w)},${R(y + r)}V${R(y + h)}Z`;
    case 'bottom':
      return `M${R(x)},${R(y)}V${R(y + h - r)}Q${R(x)},${R(y + h)} ${R(x + r)},${R(y + h)}H${R(x + w - r)}Q${R(x + w)},${R(y + h)} ${R(x + w)},${R(y + h - r)}V${R(y)}Z`;
    case 'right':
      return `M${R(x)},${R(y)}H${R(x + w - r)}Q${R(x + w)},${R(y)} ${R(x + w)},${R(y + r)}V${R(y + h - r)}Q${R(x + w)},${R(y + h)} ${R(x + w - r)},${R(y + h)}H${R(x)}Z`;
    case 'left':
      return `M${R(x + w)},${R(y)}H${R(x + r)}Q${R(x)},${R(y)} ${R(x)},${R(y + r)}V${R(y + h - r)}Q${R(x)},${R(y + h)} ${R(x + r)},${R(y + h)}H${R(x + w)}Z`;
  }
}

/** Lays out a chart into SVG primitives for a w×h box. */
export function layoutChart(spec: ChartSpec, rows: Row[], w: number, h: number, fontSize: number, textColor: string): Prim[] {
  const P: Prim[] = [];
  const fs = Math.max(6, fontSize);
  const cw = fs * 0.58; // average glyph width estimate
  const text = (x: number, y: number, s: string, anchor: 'start' | 'middle' | 'end', size = fs, weight = 400, fill = MUTED) =>
    s && P.push({ t: 'text', x, y, text: s, anchor, size, weight, fill });
  const fit = (s: string, maxW: number) => {
    if (s.length * cw <= maxW) return s;
    const n = Math.floor(maxW / cw) - 1;
    return n < 1 ? '' : s.slice(0, n) + '…';
  };
  const fmt = (v: number) => formatValue(v, spec.valueFormat);

  let top = 4;
  let bottom = h - 4;
  const left = 4;
  const right = w - 4;
  if (spec.title) {
    text(w / 2, top + fs + 1, fit(spec.title, w - 8), 'middle', fs + 2, 700, textColor);
    top += fs + 9;
  }

  const data = chartData(spec, rows);
  const pie = spec.type === 'pie' || spec.type === 'doughnut';
  if (!data.categories.length || bottom - top < 20) {
    text(w / 2, (top + bottom) / 2, 'No data', 'middle');
    return P;
  }

  // Legend (bottom): always for ≥2 series; pie slices are categories, so pies always get one.
  const legend = pie
    ? data.categories.map((c, i) => ({ name: c, color: sliceColor(c, i) }))
    : data.series.length > 1
      ? data.series.map((s) => ({ name: s.name, color: s.color }))
      : [];
  if (spec.showLegend && legend.length) {
    const lineH = fs + 6;
    const items = legend.map((l) => ({ ...l, label: fit(l.name, (right - left) / 2), width: 0 }));
    items.forEach((it) => (it.width = 14 + it.label.length * cw + 12));
    const lines: (typeof items)[] = [[]];
    let x = 0;
    for (const it of items) {
      if (x + it.width > right - left && lines[lines.length - 1].length) {
        lines.push([]);
        x = 0;
      }
      lines[lines.length - 1].push(it);
      x += it.width;
    }
    const shown = lines.slice(0, 3);
    bottom -= shown.length * lineH + 2;
    shown.forEach((line, li) => {
      const total = line.reduce((s, it) => s + it.width, 0) - 12;
      let lx = (w - total) / 2;
      const ly = bottom + 4 + li * lineH;
      for (const it of line) {
        P.push({ t: 'path', d: bar(lx, ly + (lineH - 10) / 2 - 1, 10, 10, 'top'), fill: it.color });
        text(lx + 14, ly + lineH / 2 + fs * 0.35 - 1, it.label, 'start', fs, 400, textColor);
        lx += it.width;
      }
    });
  }

  if (pie) {
    layoutPie(P, data, spec, left, top, right, bottom, fs, fmt);
    return P;
  }

  const values = data.series.flatMap((s) => s.values);
  const scale = niceScale(Math.min(...values), Math.max(...values));
  const ticks: number[] = [];
  for (let t = scale.min; t <= scale.max + scale.step / 2; t += scale.step) ticks.push(+t.toFixed(10));
  const n = data.categories.length;
  const sCount = data.series.length;
  const title = (cat: string, s: { name: string }, v: number) => `${cat}${sCount > 1 || spec.valueFields.length ? ' · ' + s.name : ''}: ${fmt(v)}`;

  if (spec.type === 'hbar') {
    const labelW = Math.min((right - left) * 0.35, Math.max(...data.categories.map((c) => c.length)) * cw + 8);
    const valueW = spec.showValues && sCount === 1 ? Math.max(...values.map((v) => fmt(v).length)) * cw + 6 : 6;
    const x0 = left + labelW;
    const x1 = right - valueW;
    const y0 = top + 2;
    const y1 = bottom - fs - 6;
    if (x1 - x0 < 20 || y1 - y0 < 10) return P;
    const xOf = (v: number) => x0 + ((v - scale.min) / (scale.max - scale.min)) * (x1 - x0);
    for (const t of ticks) {
      if (spec.showGrid) P.push({ t: 'line', x1: xOf(t), y1: y0, x2: xOf(t), y2: y1, stroke: GRID, sw: 1 });
      text(xOf(t), y1 + fs + 3, compactNumber(t), 'middle');
    }
    P.push({ t: 'line', x1: xOf(0), y1: y0, x2: xOf(0), y2: y1, stroke: AXIS, sw: 1 });
    const band = (y1 - y0) / n;
    const every = Math.max(1, Math.ceil((fs + 2) / band));
    const groupH = band * 0.72;
    const barH = Math.max(1, (groupH - (sCount - 1) * 2) / sCount);
    data.categories.forEach((cat, i) => {
      if (i % every === 0) text(x0 - 5, y0 + i * band + band / 2 + fs * 0.35, fit(cat, labelW - 8), 'end', fs, 400, textColor);
      data.series.forEach((s, j) => {
        const v = s.values[i];
        const y = y0 + i * band + (band - groupH) / 2 + j * (barH + 2);
        const a = xOf(0);
        const b = xOf(v);
        const x = Math.min(a, b);
        const bw = Math.abs(b - a);
        if (bw > 0) P.push({ t: 'path', d: bar(x, y, bw, barH, v >= 0 ? 'right' : 'left'), fill: s.color, title: title(cat, s, v) });
        if (spec.showValues && sCount === 1 && barH >= fs * 0.8) text(Math.max(a, b) + 4, y + barH / 2 + fs * 0.35, fmt(v), 'start', fs, 400, textColor);
      });
    });
    return P;
  }

  // Vertical charts: bar, line, area.
  const yLabelW = Math.max(...ticks.map((t) => compactNumber(t).length)) * cw + 6;
  const x0 = left + yLabelW;
  const x1 = right;
  const y0 = top + (spec.showValues ? fs + 2 : 4);
  const y1 = bottom - fs - 6;
  if (x1 - x0 < 20 || y1 - y0 < 10) return P;
  const yOf = (v: number) => y1 - ((v - scale.min) / (scale.max - scale.min)) * (y1 - y0);
  for (const t of ticks) {
    if (spec.showGrid) P.push({ t: 'line', x1: x0, y1: yOf(t), x2: x1, y2: yOf(t), stroke: GRID, sw: 1 });
    text(x0 - 5, yOf(t) + fs * 0.35, compactNumber(t), 'end');
  }
  const band = (x1 - x0) / n;
  const maxLabel = Math.max(...data.categories.map((c) => Math.min(c.length, 14))) * cw + 6;
  // Label every bar when ~4 characters fit (truncated); otherwise thin the labels out.
  const every = band >= cw * 4 + 4 ? 1 : Math.max(1, Math.ceil(maxLabel / band));
  data.categories.forEach((cat, i) => {
    if (i % every !== 0) return;
    const cx = x0 + i * band + band / 2;
    // Centred labels must not run past the plot edges.
    const room = Math.min(band * every - 4, 2 * (cx - left), 2 * (right - cx));
    text(cx, y1 + fs + 3, fit(cat, room), 'middle', fs, 400, textColor);
  });

  if (spec.type === 'bar') {
    const groupW = band * 0.72;
    const barW = Math.max(1, (groupW - (sCount - 1) * 2) / sCount);
    data.categories.forEach((cat, i) => {
      data.series.forEach((s, j) => {
        const v = s.values[i];
        const x = x0 + i * band + (band - groupW) / 2 + j * (barW + 2);
        const a = yOf(0);
        const b = yOf(v);
        const y = Math.min(a, b);
        const bh = Math.abs(a - b);
        if (bh > 0) P.push({ t: 'path', d: bar(x, y, barW, bh, v >= 0 ? 'top' : 'bottom'), fill: s.color, title: title(cat, s, v) });
        const label = fmt(v);
        if (spec.showValues && sCount === 1 && label.length * cw <= band + 4) text(x + barW / 2, Math.min(a, b) - 4, label, 'middle', fs, 400, textColor);
      });
    });
  } else {
    const xAt = (i: number) => x0 + i * band + band / 2;
    data.series.forEach((s) => {
      const pts = s.values.map((v, i) => [xAt(i), yOf(v)] as const);
      if (spec.type === 'area') {
        const d = `M${pts[0][0]},${yOf(0)}` + pts.map(([x, y]) => `L${x},${y}`).join('') + `L${pts[pts.length - 1][0]},${yOf(0)}Z`;
        P.push({ t: 'path', d, fill: s.color, opacity: 0.16 });
      }
      P.push({ t: 'poly', points: pts.map(([x, y]) => `${+x.toFixed(2)},${+y.toFixed(2)}`).join(' '), stroke: s.color, sw: 2 });
      const markers = n <= 40;
      pts.forEach(([x, y], i) => {
        // Small markers carry the hover tooltip; a 2px surface ring separates them from the line.
        P.push({ t: 'circle', cx: x, cy: y, r: markers ? 3.5 : 0.01, fill: s.color, stroke: SURFACE_GAP, sw: markers ? 1.5 : 0, title: title(data.categories[i], s, s.values[i]) });
      });
      if (spec.showValues && sCount === 1 && n <= 15) pts.forEach(([x, y], i) => text(x, y - 7, fmt(s.values[i]), 'middle', fs, 400, textColor));
    });
  }
  P.push({ t: 'line', x1: x0, y1: yOf(0), x2: x1, y2: yOf(0), stroke: AXIS, sw: 1 });
  return P;
}

function layoutPie(
  P: Prim[],
  data: ReturnType<typeof chartData>,
  spec: ChartSpec,
  left: number,
  top: number,
  right: number,
  bottom: number,
  fs: number,
  fmt: (v: number) => string,
) {
  const vals = data.series[0].values.map((v) => Math.max(0, v));
  const total = vals.reduce((a, b) => a + b, 0);
  const cx = (left + right) / 2;
  const cy = (top + bottom) / 2;
  const r = Math.max(4, Math.min(right - left, bottom - top) / 2 - 2);
  const ir = spec.type === 'doughnut' ? r * 0.58 : 0;
  if (total <= 0) {
    P.push({ t: 'text', x: cx, y: cy, text: 'No data', anchor: 'middle', size: fs, weight: 400, fill: MUTED });
    return;
  }
  const pt = (a: number, rad: number) => `${+(cx + rad * Math.cos(a)).toFixed(2)},${+(cy + rad * Math.sin(a)).toFixed(2)}`;
  let a0 = -Math.PI / 2;
  vals.forEach((v, i) => {
    if (v <= 0) return;
    const cat = data.categories[i];
    const sweep = (v / total) * Math.PI * 2;
    const a1 = a0 + sweep;
    const pct = (v / total) * 100;
    const title = `${cat}: ${fmt(v)} (${pct.toFixed(1)}%)`;
    let d: string;
    if (sweep >= Math.PI * 2 - 1e-6) {
      // Full circle: two half arcs.
      d = `M${pt(0, r)}A${r},${r} 0 1 1 ${pt(Math.PI, r)}A${r},${r} 0 1 1 ${pt(0, r)}Z`;
      if (ir) d += `M${pt(0, ir)}A${ir},${ir} 0 1 0 ${pt(Math.PI, ir)}A${ir},${ir} 0 1 0 ${pt(0, ir)}Z`;
    } else {
      const large = sweep > Math.PI ? 1 : 0;
      d = ir
        ? `M${pt(a0, r)}A${r},${r} 0 ${large} 1 ${pt(a1, r)}L${pt(a1, ir)}A${ir},${ir} 0 ${large} 0 ${pt(a0, ir)}Z`
        : `M${cx},${cy}L${pt(a0, r)}A${r},${r} 0 ${large} 1 ${pt(a1, r)}Z`;
    }
    // 2px surface-colored stroke separates neighbouring slices.
    P.push({ t: 'path', d, fill: sliceColor(cat, i), stroke: SURFACE_GAP, sw: 2, title });
    if (spec.showValues && sweep > 0.35) {
      const mid = (a0 + a1) / 2;
      const lr = ir ? (r + ir) / 2 : r * 0.62;
      P.push({
        t: 'text',
        x: cx + lr * Math.cos(mid),
        y: cy + lr * Math.sin(mid) + fs * 0.35,
        text: `${Math.round(pct)}%`,
        anchor: 'middle',
        size: fs,
        weight: 700,
        fill: '#ffffff',
      });
    }
    a0 = a1;
  });
}
