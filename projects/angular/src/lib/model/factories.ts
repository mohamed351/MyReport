import type { Band, BandType, ReportDefinition, ReportElement } from './types';
import { contentWidth, createBand, createElement } from './defaults';

export interface FieldRef {
  name: string;
  type?: string;
}

const firstOf = (fields: FieldRef[], type: string, skip: string[] = []) =>
  fields.find((f) => f.type === type && !skip.includes(f.name))?.name ?? '';

export function createChart(x: number, y: number, w: number, fields: FieldRef[]): ReportElement {
  const category = firstOf(fields, 'string');
  const value = fields.find((f) => f.type === 'number' && !/id$/i.test(f.name))?.name ?? firstOf(fields, 'number');
  return createElement('chart', x, y, {
    w: Math.min(w, 420),
    h: 240,
    style: { fontSize: 11, color: '#333333' },
    chart: {
      // Horizontal bars read best for ranked categories with long names.
      type: 'hbar',
      title: value && category ? `${value} by ${category}` : 'Chart',
      categoryField: category,
      valueFields: value ? [value] : [],
      aggregate: value ? 'sum' : 'count',
      sort: 'valueDesc',
      maxCategories: 12,
      showLegend: true,
      showValues: false,
      showGrid: true,
      valueFormat: { kind: 'number', decimals: 0, currency: 'USD' },
    },
  });
}

export function createBarcode(x: number, y: number, fields: FieldRef[]): ReportElement {
  const id = fields.find((f) => /id$|code|number|sku/i.test(f.name))?.name ?? fields[0]?.name;
  return createElement('barcode', x, y, {
    text: id ? `{${id}}` : '12345678',
    style: { fontSize: 11, fontFamily: "Consolas, 'Courier New', monospace" },
    barcode: { symbology: 'code128', showText: true, color: '#000000' },
  });
}

export function createQr(x: number, y: number, fields: FieldRef[]): ReportElement {
  const id = fields.find((f) => /id$|code|number/i.test(f.name))?.name ?? fields[0]?.name;
  return createElement('qrcode', x, y, {
    text: id ? `https://example.com/item/{${id}}` : 'https://example.com',
    qr: { errorCorrection: 'M', color: '#000000' },
  });
}

export function createCrosstab(x: number, y: number, w: number, fields: FieldRef[]): ReportElement {
  const rowField = firstOf(fields, 'string');
  const columnField = firstOf(fields, 'string', [rowField]);
  const valueField = fields.find((f) => f.type === 'number' && !/id$/i.test(f.name))?.name ?? '';
  return createElement('crosstab', x, y, {
    w: Math.max(200, w),
    h: 120,
    style: { fontSize: 11, padding: 4 },
    crosstab: {
      rowField,
      columnField,
      valueField,
      aggregate: valueField ? 'sum' : 'count',
      cornerText: '',
      showRowTotals: true,
      showColumnTotals: true,
      valueFormat: { kind: 'number', decimals: 0, currency: 'USD' },
      headerHeight: 24,
      rowHeight: 22,
      headerBackground: '#1f3a68',
      headerColor: '#ffffff',
      stripeBackground: '#f3f6fb',
      gridColor: '#c9d1dd',
      repeatHeader: true,
    },
  });
}

// ---------------------------------------------------------------------------------------------
// Header/Detail ("banded") table: column titles in a header band, one field per column in Detail.

export interface BandedTableOptions {
  fields: FieldRef[];
  /** Band that receives the column titles. */
  titleBand: 'pageHeader' | 'reportHeader' | 'groupHeader';
  /** For titleBand 'groupHeader': which group. Defaults to the innermost. */
  groupId?: string;
  grid: boolean;
  headerBackground: string;
  headerColor: string;
  /** Adds sum() of numeric columns to the Report Footer. */
  totals: boolean;
  rowHeight: number;
  /** Clear the title band and Detail band first (otherwise the table is appended below). */
  replace: boolean;
}

/** Relative column width by field type. */
const weight = (f: FieldRef) => (f.type === 'number' ? 1 : f.type === 'date' ? 1.2 : 2);

/** Finds or creates (and shows) the band a banded table writes into. */
function ensureBand(r: ReportDefinition, type: BandType, groupId?: string): Band {
  let b = r.bands.find((x) => x.type === type && (!groupId || x.groupId === groupId));
  if (!b) {
    b = createBand(type, 0, groupId);
    b.elements = [];
    r.bands.push(b);
  }
  b.visible = true;
  return b;
}

/** Appends one row of cells to the bottom of a band (growing the band). */
function appendRow(band: Band, cells: ReportElement[], rowHeight: number) {
  const y = band.elements.length ? band.height : 0;
  for (const c of cells) c.y = y;
  band.elements.push(...cells);
  band.height = y + rowHeight;
}

/** Adds the banded table to the report; returns the ids of the created elements. */
export function addBandedTable(r: ReportDefinition, o: BandedTableOptions): string[] {
  const width = contentWidth(r.page);
  const total = o.fields.reduce((s, f) => s + weight(f), 0) || 1;
  const border = o.grid ? 1 : 0;
  const lineColor = '#c9d1dd';

  // Integer column edges so neighbouring cells share their 1px border instead of doubling it.
  let acc = 0;
  const cols = o.fields.map((f) => {
    const x0 = Math.round((acc / total) * width);
    acc += weight(f);
    const x1 = Math.round((acc / total) * width);
    const align = f.type === 'number' ? ('right' as const) : ('left' as const);
    return { f, x: x0, w: x1 - x0 + (o.grid && x1 < width ? border : 0), align };
  });

  const groupId = o.titleBand === 'groupHeader' ? o.groupId ?? r.groups[r.groups.length - 1]?.id : undefined;
  const titleBand = ensureBand(r, o.titleBand === 'groupHeader' && !groupId ? 'pageHeader' : o.titleBand, groupId);
  const detail = ensureBand(r, 'detail');
  if (o.replace) for (const b of [titleBand, detail]) (b.elements = []), (b.height = 0);
  const ids: string[] = [];
  const cell = (el: ReportElement) => (ids.push(el.id), el);
  const cellStyle = { borderWidth: border, borderColor: lineColor, padding: 4 };

  appendRow(
    titleBand,
    cols.map((c) =>
      cell(
        createElement('text', c.x, 0, {
          w: c.w,
          h: o.rowHeight + border,
          text: c.f.name,
          canGrow: false,
          style: { ...cellStyle, bold: true, align: c.align, background: o.headerBackground, color: o.headerColor },
        }),
      ),
    ),
    o.rowHeight,
  );
  if (!o.grid) {
    appendRow(titleBand, [cell(createElement('line', 0, 0, { w: width, h: 4, style: { borderColor: o.headerBackground, borderWidth: 2 } }))], 4);
  }

  appendRow(
    detail,
    cols.map((c) =>
      cell(
        createElement('field', c.x, 0, {
          w: c.w,
          h: o.rowHeight + border,
          text: `{${c.f.name}}`,
          format: c.f.type === 'date' ? { kind: 'date' } : {},
          // Top-aligned so short cells line up with the first line of a tall neighbour.
          style: { ...cellStyle, align: c.align, vAlign: 'top' },
        }),
      ),
    ),
    o.rowHeight,
  );

  // Totals only for measures: skip identifiers such as OrderID.
  const summable = (c: (typeof cols)[number]) => c.f.type === 'number' && !/id$/i.test(c.f.name);
  if (o.totals && cols.some(summable)) {
    const footer = ensureBand(r, 'reportFooter');
    const firstNumeric = cols.findIndex(summable);
    const cells: ReportElement[] = [];
    if (firstNumeric > 0) {
      const label = cols[firstNumeric - 1];
      cells.push(cell(createElement('text', label.x, 0, { w: label.w, h: o.rowHeight, text: 'Total', style: { bold: true, align: 'right', padding: 4 } })));
    }
    for (const c of cols.filter(summable)) {
      cells.push(
        cell(
          createElement('field', c.x, 0, {
            w: c.w,
            h: o.rowHeight + border,
            text: `{sum(${c.f.name})}`,
            format: { kind: 'number', decimals: 2 },
            style: { ...cellStyle, bold: true, align: 'right' },
          }),
        ),
      );
    }
    appendRow(footer, cells, o.rowHeight);
  }
  return ids;
}

// ---------------------------------------------------------------------------------------------
// Receipt template (thermal roll): rows are the receipt's items; shop/payment details come from
// the document itself as root.x (e.g. {root.store.name}).

export const RECEIPT_WIDTHS = { 80: 302, 58: 219 } as const; // px at 96 dpi

export function receiptReport(paper: 80 | 58 = 80): ReportDefinition {
  const width = RECEIPT_WIDTHS[paper];
  const margin = paper === 80 ? 10 : 6;
  const cw = width - margin * 2;
  const fs = paper === 80 ? 11 : 10;
  const mono = "Consolas, 'Courier New', monospace";
  const base = { fontFamily: mono, fontSize: fs, color: '#111111', padding: 1, vAlign: 'top' as const };
  const money = (expr: string) => `{format(${expr}, "number", 2)}`;
  const totalExpr = 'sum(qty * price) * (1 + root.taxRate)';

  const text = (x: number, y: number, w: number, h: number, t: string, style: Record<string, unknown> = {}) =>
    createElement('field', x, y, { w, h, text: t, style: { ...base, ...style } });
  const left = (y: number, t: string, style: Record<string, unknown> = {}, h = fs + 5) => text(0, y, Math.round(cw * 0.6), h, t, style);
  const right = (y: number, t: string, style: Record<string, unknown> = {}, h = fs + 5) =>
    text(Math.round(cw * 0.4), y, cw - Math.round(cw * 0.4), h, t, { ...style, align: 'right' });
  const center = (y: number, t: string, style: Record<string, unknown> = {}, h = fs + 5) => text(0, y, cw, h, t, { ...style, align: 'center' });
  const dashed = (y: number) => createElement('line', 0, y, { w: cw, h: 4, dash: 'dashed', style: { borderColor: '#444444', borderWidth: 1 } });

  const r: ReportDefinition = {
    version: 1,
    name: `Receipt ${paper}mm`,
    page: { width, height: 1123, marginTop: 10, marginBottom: 14, marginLeft: margin, marginRight: margin, continuous: true },
    dataSource: {
      type: 'json', url: '/samples/receipt.json', inline: '', dataPath: 'items', headers: '',
      entitySet: '', select: '', filter: '', orderby: '', expand: '', top: null, maxRows: 5000,
    },
    groups: [],
    sort: [],
    bands: [],
  };

  const header = createBand('reportHeader', 0);
  const lh = fs + 4;
  header.elements.push(
    center(0, '{root.store.name}', { fontSize: fs + 5, bold: true }, fs + 10),
    center(fs + 11, '{root.store.address}', { fontSize: fs - 1 }),
    center(fs + 11 + lh, 'Tel {root.store.phone}', { fontSize: fs - 1 }),
    center(fs + 11 + lh * 2, 'Tax ID {root.store.taxId}', { fontSize: fs - 1 }),
  );
  let y = fs + 15 + lh * 3;
  header.elements.push(dashed(y));
  y += 6;
  header.elements.push(
    left(y, 'Receipt'), right(y, '{root.receiptNo}'),
    left(y + lh, 'Date'), right(y + lh, '{formatdate(root.date, "dd/MM/yyyy HH:mm")}'),
    left(y + lh * 2, 'Cashier {root.cashier}'), right(y + lh * 2, 'Table {root.table}'),
  );
  y += lh * 3 + 2;
  header.elements.push(dashed(y));
  y += 6;
  header.elements.push(left(y, 'ITEM', { bold: true }), right(y, `TOTAL ${'{root.currency}'}`, { bold: true }));
  y += lh + 2;
  header.elements.push(dashed(y));
  header.height = y + 6;

  // Detail: name + line total on line 1 (they grow together for long names); "qty x price" below.
  const detail = createBand('detail', 0);
  const priceW = Math.round(cw * 0.32);
  detail.elements.push(
    text(0, 0, cw - priceW, fs + 5, '{name}', { bold: true }),
    text(cw - priceW, 0, priceW, fs + 5, money('qty * price'), { align: 'right' }),
    text(0, fs + 5, cw, fs + 4, `  {qty} x ${money('price')}`, { fontSize: fs - 1, color: '#444444' }),
  );
  detail.height = fs * 2 + 11;

  const footer = createBand('reportFooter', 0);
  y = 0;
  footer.elements.push(dashed(y));
  y += 6;
  footer.elements.push(left(y, 'Subtotal'), right(y, money('sum(qty * price)')));
  y += lh;
  footer.elements.push(left(y, 'VAT {format(root.taxRate, "percent", 0)}'), right(y, money('sum(qty * price) * root.taxRate')));
  y += lh + 4;
  footer.elements.push(
    left(y, 'TOTAL', { bold: true, fontSize: fs + 3 }, fs + 9),
    right(y, `{root.currency} ${money(totalExpr)}`, { bold: true, fontSize: fs + 3 }, fs + 9),
  );
  y += fs + 12;
  footer.elements.push(left(y, '{root.payment.method}'), right(y, money('root.payment.paid')));
  y += lh;
  footer.elements.push(left(y, 'Change'), right(y, money(`root.payment.paid - ${totalExpr}`)));
  y += lh + 4;
  footer.elements.push(dashed(y));
  y += 8;
  footer.elements.push(center(y, '{count()} items · {sum(qty)} pcs', { fontSize: fs - 1, color: '#444444' }));
  y += lh + 6;

  const bcW = Math.min(cw, 220);
  const barcode = createBarcode((cw - bcW) / 2, y, []);
  Object.assign(barcode, { w: bcW, h: 54, text: '{root.receiptNo}' });
  barcode.style = { ...barcode.style, fontSize: fs - 1 };
  footer.elements.push(barcode);
  y += 62;
  const qrSize = paper === 80 ? 96 : 84;
  const qr = createQr((cw - qrSize) / 2, y, []);
  Object.assign(qr, { w: qrSize, h: qrSize, text: 'https://example.com/r/{root.receiptNo}' });
  footer.elements.push(qr);
  y += qrSize + 4;
  footer.elements.push(center(y, 'Thank you for your visit!', { bold: true }), center(y + lh + 2, 'Please keep this receipt', { fontSize: fs - 1, color: '#444444' }));
  footer.height = y + lh * 2 + 4;

  const pageHeader = createBand('pageHeader', 0);
  const pageFooter = createBand('pageFooter', 0);
  pageHeader.visible = pageFooter.visible = false;
  r.bands.push(header, pageHeader, detail, pageFooter, footer);
  return r;
}
