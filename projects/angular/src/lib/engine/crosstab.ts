import type { ReportElement, TableColumn } from '../model/types';
import { aggregate, formatValue, getPath, type Row } from './expressions';
import type { TableRenderData } from './table';

export interface Pivot {
  rowKeys: string[];
  colKeys: string[];
  /** cells[r][c] = aggregate, null when no rows fall in the cell. */
  cells: (number | null)[][];
  rowTotals: (number | null)[];
  colTotals: (number | null)[];
  grandTotal: number | null;
}

const num = (v: unknown): number | null => (v == null || Number.isNaN(Number(v)) ? null : Number(v));
const byName = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
// Braces would be read as expressions when the cell text is rendered.
const literal = (s: string) => s.replace(/[{}]/g, '');

export function pivot(el: ReportElement, rows: Row[]): Pivot {
  const x = el.crosstab!;
  const key = (r: Row, f: string) => (f ? String(getPath(r, f) ?? '(blank)') : 'All');
  const rowKeys = [...new Set(rows.map((r) => key(r, x.rowField)))].sort(byName);
  const colKeys = [...new Set(rows.map((r) => key(r, x.columnField)))].sort(byName);
  const bucket = new Map<string, Row[]>();
  for (const r of rows) {
    const k = key(r, x.rowField) + '\u0000' + key(r, x.columnField);
    let b = bucket.get(k);
    if (!b) bucket.set(k, (b = []));
    b.push(r);
  }
  const agg = (set: Row[]) => (set.length ? num(aggregate(x.aggregate, x.valueField, set)) : null);
  const cells = rowKeys.map((rk) => colKeys.map((ck) => agg(bucket.get(rk + '\u0000' + ck) ?? [])));
  // Totals aggregate the underlying rows (so avg/min/max stay correct, not sums of averages).
  const rowTotals = rowKeys.map((rk) => agg(rows.filter((r) => key(r, x.rowField) === rk)));
  const colTotals = colKeys.map((ck) => agg(rows.filter((r) => key(r, x.columnField) === ck)));
  return { rowKeys, colKeys, cells, rowTotals, colTotals, grandTotal: agg(rows) };
}

/**
 * Turns a cross table into an ordinary table element + data rows (cells pre-formatted), so the
 * renderer can paginate it with the table code: header repeats, rows flow, totals form the footer.
 */
export function crosstabAsTable(el: ReportElement, rows: Row[]): { table: ReportElement; data: Row[]; render: TableRenderData } {
  const x = el.crosstab!;
  const p = pivot(el, rows);
  const fmt = (v: number | null) => (v == null ? '' : formatValue(v, x.valueFormat));
  const totalLabel = x.aggregate === 'count' ? 'Count' : x.aggregate === 'avg' ? 'Average' : 'Total';

  const col = (id: string, header: string, footer: string, width: number, align: TableColumn['align']): TableColumn => ({
    id,
    header: literal(header),
    text: `{${id}}`,
    footer: literal(footer),
    width,
    align,
    format: { kind: 'none', decimals: 0, currency: '' },
  });
  const columns: TableColumn[] = [
    col('c0', x.cornerText || `${x.rowField || ''} / ${x.columnField || ''}`, totalLabel, 1.6, 'left'),
    ...p.colKeys.map((k, i) => col(`c${i + 1}`, k, fmt(p.colTotals[i]), 1, 'right')),
  ];
  if (x.showRowTotals) columns.push(col(`c${p.colKeys.length + 1}`, totalLabel, fmt(p.grandTotal), 1, 'right'));

  const data: Row[] = p.rowKeys.map((rk, r) => {
    const o: Row = { c0: literal(rk) };
    p.colKeys.forEach((_, c) => (o[`c${c + 1}`] = fmt(p.cells[r][c])));
    if (x.showRowTotals) o[`c${p.colKeys.length + 1}`] = fmt(p.rowTotals[r]);
    return o;
  });

  const table: ReportElement = {
    ...el,
    kind: 'table',
    table: {
      columns,
      showHeader: true,
      repeatHeader: x.repeatHeader,
      showFooter: x.showColumnTotals,
      headerHeight: x.headerHeight,
      rowHeight: x.rowHeight,
      headerBackground: x.headerBackground,
      headerColor: x.headerColor,
      stripeBackground: x.stripeBackground,
      gridColor: x.gridColor,
    },
  };
  const render: TableRenderData = {
    header: columns.map((c) => c.header),
    headerHeight: x.headerHeight,
    rows: data.map((d, i) => ({ cells: columns.map((c) => String(d[c.id] ?? '')), height: x.rowHeight, index: i })),
    footer: x.showColumnTotals ? columns.map((c) => c.footer) : null,
    footerHeight: x.rowHeight,
  };
  return { table, data, render };
}
