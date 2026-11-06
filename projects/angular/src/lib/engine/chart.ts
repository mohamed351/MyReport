import type { ChartSpec } from '../model/types';
import { aggregate, getPath, type Row } from './expressions';

/** Validated categorical palette (light surface), assigned in fixed order — never cycled. */
export const SERIES_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
export const OTHER_COLOR = '#9a9a96';
export const MAX_SERIES = SERIES_COLORS.length;

export interface ChartData {
  categories: string[];
  series: { name: string; values: number[]; color: string }[];
}

const toNum = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);

/** Groups rows by category and aggregates each value field into a series. */
export function chartData(spec: ChartSpec, rows: Row[]): ChartData {
  const pie = spec.type === 'pie' || spec.type === 'doughnut';
  const fields = (spec.valueFields.filter(Boolean).length ? spec.valueFields.filter(Boolean) : ['']).slice(0, pie ? 1 : MAX_SERIES);

  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const key = spec.categoryField ? String(getPath(r, spec.categoryField) ?? '(blank)') : 'All';
    let g = groups.get(key);
    if (!g) groups.set(key, (g = []));
    g.push(r);
  }
  let cats = [...groups.keys()].map((name) => ({
    name,
    rows: groups.get(name)!,
    values: fields.map((f) => toNum(aggregate(spec.aggregate, f, groups.get(name)!))),
  }));

  if (spec.sort === 'category') cats.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  else if (spec.sort === 'valueDesc') cats.sort((a, b) => b.values[0] - a.values[0]);
  else if (spec.sort === 'valueAsc') cats.sort((a, b) => a.values[0] - b.values[0]);

  // Pie slices beyond the palette (or maxCategories) fold into "Other"; other charts are just truncated.
  const max = Math.max(1, pie ? Math.min(spec.maxCategories || MAX_SERIES, MAX_SERIES) : spec.maxCategories || 50);
  if (cats.length > max) {
    if (pie) {
      const keep = cats.slice(0, max - 1);
      const rest = cats.slice(max - 1).flatMap((c) => c.rows);
      keep.push({ name: 'Other', rows: rest, values: fields.map((f) => toNum(aggregate(spec.aggregate, f, rest))) });
      cats = keep;
    } else {
      cats = cats.slice(0, max);
    }
  }

  if (pie) {
    return {
      categories: cats.map((c) => c.name),
      series: [{ name: fields[0] || 'Count', values: cats.map((c) => c.values[0]), color: SERIES_COLORS[0] }],
    };
  }
  return {
    categories: cats.map((c) => c.name),
    series: fields.map((f, i) => ({ name: f || 'Count', values: cats.map((c) => c.values[i]), color: SERIES_COLORS[i] })),
  };
}

/** Pie slice colors: one fixed-order hue per category, "Other" in neutral gray. */
export const sliceColor = (name: string, i: number) => (name === 'Other' ? OTHER_COLOR : SERIES_COLORS[i % MAX_SERIES]);

/** "Nice" axis: rounded max and tick step for values in [min, max]. */
export function niceScale(min: number, max: number, ticks = 5): { min: number; max: number; step: number } {
  const lo = Math.min(0, min);
  const hi = Math.max(0, max);
  if (hi === lo) return { min: lo, max: lo + 1, step: 0.2 };
  const raw = (hi - lo) / ticks;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  return { min: Math.floor(lo / step) * step, max: Math.ceil(hi / step) * step, step };
}

/** Short tick label: 1.2K, 3.4M. */
export function compactNumber(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return +(n / 1e9).toFixed(1) + 'B';
  if (a >= 1e6) return +(n / 1e6).toFixed(1) + 'M';
  if (a >= 1e3) return +(n / 1e3).toFixed(1) + 'K';
  return String(+n.toFixed(2));
}
