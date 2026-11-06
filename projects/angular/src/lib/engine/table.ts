import type { ElementStyle, FormatSpec, ReportElement, TableColumn, TableSpec } from '../model/types';

/** Already-evaluated cell strings for drawing a table (designer and preview). */
export interface TableRenderData {
  header: string[] | null;
  headerHeight: number;
  rows: { cells: string[]; height: number; index: number }[];
  footer: string[] | null;
  footerHeight: number;
}

export const hasGrid = (t: TableSpec) => !!t.gridColor && t.gridColor !== 'transparent';

/** Pixel width of each column (relative widths scaled to the table width). */
export function columnWidths(el: ReportElement): number[] {
  const cols = el.table?.columns ?? [];
  const total = cols.reduce((s, c) => s + Math.max(0, c.width), 0) || 1;
  return cols.map((c) => (el.w * Math.max(0, c.width)) / total);
}

/** Style used for measuring/drawing one cell (1px grid line counts as a border). */
export function tableCellStyle(el: ReportElement, header: boolean): ElementStyle {
  const t = el.table!;
  return { ...el.style, bold: header || el.style.bold, borderWidth: hasGrid(t) ? 1 : 0 };
}

/** Height shown in the designer: header + one sample row + footer. */
export function designTableHeight(t: TableSpec): number {
  return (t.showHeader ? t.headerHeight : 0) + t.rowHeight + (t.showFooter ? t.rowHeight : 0);
}

export function defaultTableSpec(columns: TableColumn[]): TableSpec {
  return {
    columns,
    showHeader: true,
    repeatHeader: true,
    showFooter: false,
    headerHeight: 24,
    rowHeight: 22,
    headerBackground: '#1f3a68',
    headerColor: '#ffffff',
    stripeBackground: '#f3f6fb',
    gridColor: '#c9d1dd',
  };
}

export function createColumn(field: string, type?: string, format?: Partial<FormatSpec>): TableColumn {
  const numeric = type === 'number';
  return {
    id: Math.random().toString(36).slice(2, 10),
    header: field || 'Column',
    text: field ? `{${field}}` : '',
    footer: '',
    width: numeric ? 1 : type === 'date' ? 1.2 : 2,
    align: numeric ? 'right' : 'left',
    format: { kind: type === 'date' ? 'date' : 'none', decimals: 2, currency: 'USD', ...format },
  };
}
