import type { Band, BandType, ReportDefinition, ReportElement } from '../model/types';
import { getPath, renderTemplate, type EvalContext, type Row } from './expressions';
import { canGrow, measureTextHeight } from './measure';
import { columnWidths, tableCellStyle } from './table';
import { crosstabAsTable } from './crosstab';
import { filterRows, type ParamValues } from './parameters';

type BandContext = Pick<EvalContext, 'row' | 'rows' | 'allRows' | 'rowNumber' | 'reportName' | 'params' | 'root'>;

/** The slice of a table rendered inside one band instance (tables can span pages). */
export interface PlacedTable {
  rows: Row[];
  rowHeights: number[];
  /** Index of rows[0] within the full table (for striping and RowNumber). */
  startIndex: number;
  header: boolean;
  headerHeight: number;
  footer: boolean;
  footerHeight: number;
}

export interface PlacedElement {
  el: ReportElement;
  top: number;
  height: number;
  table?: PlacedTable;
}

export interface PlacedBand {
  band: Band;
  top: number;
  /** Actual height of this band instance (>= band.height when fields grew). */
  height: number;
  items: PlacedElement[];
  ctx: BandContext;
}

export interface RenderedPage {
  index: number;
  bands: PlacedBand[];
  rows: Row[];
  /** Set for continuous (receipt) pages: the actual page height. */
  height?: number;
}

const measureCtx = (ctx: BandContext): EvalContext => ({ ...ctx, pageRows: [], pageNumber: 1, totalPages: 1 });

/** Sizes one band instance: grows fields to fit their text and pushes elements below them down. */
function layoutBand(band: Band, ctx: BandContext, grow: boolean): { height: number; items: PlacedElement[] } {
  const growth = new Map<string, number>();
  if (grow) {
    const evalCtx = measureCtx(ctx);
    for (const el of band.elements) {
      if (!canGrow(el)) continue;
      const needed = measureTextHeight(renderTemplate(el.text, evalCtx, el.format), el);
      if (needed > el.h) growth.set(el.id, needed - el.h);
    }
    // Cells of one row (same top and height, e.g. table columns in Detail) grow together,
    // so every box in the row ends up as tall as its tallest cell.
    const rows = new Map<string, typeof band.elements>();
    for (const el of band.elements) {
      if (el.kind === 'line') continue;
      const key = `${el.y}|${el.h}`;
      rows.set(key, [...(rows.get(key) ?? []), el]);
    }
    for (const row of rows.values()) {
      if (row.length < 2) continue;
      const max = Math.max(0, ...row.map((e) => growth.get(e.id) ?? 0));
      if (max > 0) for (const e of row) growth.set(e.id, max);
    }
  }
  if (!growth.size) return { height: band.height, items: band.elements.map((el) => ({ el, top: el.y, height: el.h })) };

  const grown = band.elements.filter((g) => growth.has(g.id));
  let height = band.height;
  const items = band.elements.map((el) => {
    // Shift by the largest growth of any growing element that sits entirely above this one.
    const shift = Math.max(0, ...grown.filter((g) => g !== el && el.y >= g.y + g.h).map((g) => growth.get(g.id)!));
    const item = { el, top: el.y + shift, height: el.h + (growth.get(el.id) ?? 0) };
    height = Math.max(height, item.top + item.height + Math.max(0, band.height - (el.y + el.h)));
    return item;
  });
  return { height, items };
}

/** Height of one table row: the fixed row height, or more if a cell's text needs it. */
function tableRowHeight(table: ReportElement, widths: number[], base: number, texts: string[], ctx: EvalContext, header = false): number {
  if (table.canGrow === false) return base;
  const cols = table.table!.columns;
  let h = base;
  texts.forEach((tpl, i) => {
    if (!tpl) return;
    const text = renderTemplate(tpl, ctx, header ? { kind: 'none', decimals: 0, currency: '' } : cols[i].format);
    const probe: ReportElement = { ...table, w: widths[i], style: tableCellStyle(table, header) };
    h = Math.max(h, measureTextHeight(text, probe));
  });
  return h;
}

function compare(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

function sortRows(r: ReportDefinition, rows: Row[]): Row[] {
  const keys = [
    ...r.groups.filter((g) => g.field).map((g) => ({ field: g.field, dir: g.direction })),
    ...r.sort.filter((s) => s.field).map((s) => ({ field: s.field, dir: s.direction })),
  ];
  if (!keys.length) return rows;
  return [...rows].sort((a, b) => {
    for (const k of keys) {
      const c = compare(getPath(a, k.field), getPath(b, k.field));
      if (c) return k.dir === 'desc' ? -c : c;
    }
    return 0;
  });
}

/**
 * Lays out bands onto pages. Text is evaluated later (needs TotalPages).
 * `params` are the report parameter values (also used by the report filter).
 */
export function paginate(report: ReportDefinition, inputRows: Row[], params: ParamValues = {}, root?: unknown): RenderedPage[] {
  const visible = (t: BandType, gid?: string) =>
    report.bands.find((b) => b.type === t && b.visible && (gid === undefined || b.groupId === gid));
  const { page } = report;
  const pageHeader = visible('pageHeader');
  const pageFooter = visible('pageFooter');
  const reportHeader = visible('reportHeader');
  const detail = visible('detail');
  // A receipt roll never breaks: the page simply gets as long as the content.
  const bodyBottom = page.continuous ? Infinity : page.height - page.marginBottom - (pageFooter?.height ?? 0);
  const rows = sortRows(report, filterRows(report, inputRows, params));
  const base = { allRows: rows, reportName: report.name, params, root };

  const pages: RenderedPage[] = [];
  let cur!: RenderedPage;
  let y = 0;
  let contentStart = 0;
  let rowNumber = 0;

  const startPage = () => {
    cur = { index: pages.length, bands: [], rows: [] };
    pages.push(cur);
    y = page.marginTop;
    // Report Header comes first on page 1, above the Page Header.
    if (pages.length === 1 && reportHeader) {
      placeFlow(reportHeader, { ...base, row: rows[0], rows, rowNumber: 0 }, false);
      // A table in the Report Header spilled onto later pages; those pages already have their Page Header.
      if (pages.length > 1) return;
    }
    if (pageHeader && pageHeader.height > 0) {
      const ctx = { ...base, row: undefined, rows: [], rowNumber };
      cur.bands.push({ band: pageHeader, top: y, ctx, ...layoutBand(pageHeader, ctx, false) });
      y += pageHeader.height;
    }
    contentStart = y;
  };

  /** Places a band; `canBreak` = may move to a new page when it doesn't fit. */
  function placeFlow(band: Band, ctx: BandContext, canBreak: boolean, keepWith = 0, pageRow?: Row) {
    if (band.height <= 0) return;
    const table = band.elements.find((e) => (e.kind === 'table' && e.table) || (e.kind === 'crosstab' && e.crosstab));
    if (table) return placeTable(band, table, ctx, canBreak);
    const layout = layoutBand(band, ctx, true);
    if (canBreak && y + layout.height + keepWith > bodyBottom && y > contentStart) startPage();
    cur.bands.push({ band, top: y, ctx, ...layout });
    y += layout.height;
    if (pageRow) cur.rows.push(pageRow);
  }

  const place = (band: Band | undefined, ctx: BandContext, keepWith = 0, pageRow?: Row) => {
    if (band) placeFlow(band, ctx, true, keepWith, pageRow);
  };

  /**
   * A band holding a table: elements above the table go in the first slice, rows flow across
   * as many pages as needed (header repeated), the footer row and elements below go in the last slice.
   */
  function placeTable(band: Band, source: ReportElement, ctx: BandContext, canBreak: boolean) {
    const scope = band.type === 'detail' ? (ctx.row ? [ctx.row] : []) : ctx.rows;
    // A cross table is laid out as a table of pivoted, pre-formatted rows.
    const pivoted = source.kind === 'crosstab' ? crosstabAsTable(source, scope) : null;
    const table = pivoted ? pivoted.table : source;
    const t = table.table!;
    // Detail bands repeat per record, so a table there shows just that record.
    const data = pivoted ? pivoted.data : scope;
    const widths = columnWidths(table);
    const mctx = measureCtx(ctx);
    const rowHeights = data.map((row, i) =>
      tableRowHeight(table, widths, t.rowHeight, t.columns.map((c) => c.text), { ...mctx, row, rowNumber: i + 1 }),
    );
    const headerH = t.showHeader ? tableRowHeight(table, widths, t.headerHeight, t.columns.map((c) => c.header), mctx, true) : 0;
    const footerH = t.showFooter
      ? tableRowHeight(table, widths, t.rowHeight, t.columns.map((c) => c.footer), { ...mctx, rows: data, row: data[data.length - 1] })
      : 0;

    const tableBottom = table.y + table.h;
    const aboveEls = band.elements.filter((e) => e.id !== table.id && e.y < tableBottom);
    const belowEls = band.elements.filter((e) => e.id !== table.id && e.y >= tableBottom);
    const tail = Math.max(0, band.height - tableBottom);

    const firstNeed = table.y + headerH + (rowHeights[0] ?? footerH);
    if (canBreak && y + firstNeed > bodyBottom && y > contentStart) startPage();

    let i = 0;
    let first = true;
    let footerDone = !t.showFooter;
    for (;;) {
      const sliceTop = y;
      const items: PlacedElement[] = [];
      let cy = 0;
      if (first) {
        items.push(...aboveEls.map((el) => ({ el, top: el.y, height: el.h })));
        cy = table.y;
      }
      const tableTop = cy;
      const header = headerH > 0 && (first || t.repeatHeader);
      if (header) cy += headerH;
      const start = i;
      while (i < data.length && (i === start || sliceTop + cy + rowHeights[i] <= bodyBottom)) cy += rowHeights[i++];

      let footer = false;
      if (i >= data.length && !footerDone && (i === start || sliceTop + cy + footerH <= bodyBottom)) {
        footer = footerDone = true;
        cy += footerH;
      }
      items.push({
        el: table,
        top: tableTop,
        height: cy - tableTop,
        table: { rows: data.slice(start, i), rowHeights: rowHeights.slice(start, i), startIndex: start, header, headerHeight: headerH, footer, footerHeight: footerH },
      });

      const complete = i >= data.length && footerDone;
      let height = first ? Math.max(cy, ...aboveEls.map((e) => e.y + e.h)) : cy;
      const tailHere = complete && sliceTop + Math.max(height, cy + tail) <= bodyBottom;
      if (tailHere) {
        items.push(...belowEls.map((el) => ({ el, top: cy + el.y - tableBottom, height: el.h })));
        height = Math.max(height, cy + tail);
      }
      cur.bands.push({ band, top: sliceTop, height, ctx, items });
      y = sliceTop + height;

      if (complete) {
        if (!tailHere && tail > 0) {
          startPage();
          cur.bands.push({ band, top: y, height: tail, ctx, items: belowEls.map((el) => ({ el, top: el.y - tableBottom, height: el.h })) });
          y += tail;
        }
        cur.rows.push(...data);
        return;
      }
      cur.rows.push(...data.slice(start, i));
      startPage();
      first = false;
    }
  }

  const emit = (level: number, groupRows: Row[]) => {
    if (level >= report.groups.length) {
      for (const row of groupRows) {
        rowNumber++;
        place(detail, { ...base, row, rows: groupRows, rowNumber }, 0, row);
      }
      return;
    }
    const g = report.groups[level];
    const parts: Row[][] = [];
    let lastKey: unknown = Symbol();
    for (const row of groupRows) {
      const key = String(getPath(row, g.field) ?? '');
      if (key !== lastKey) {
        parts.push([]);
        lastKey = key;
      }
      parts[parts.length - 1].push(row);
    }
    for (const part of parts) {
      place(visible('groupHeader', g.id), { ...base, row: part[0], rows: part, rowNumber }, detail?.height ?? 0);
      emit(level + 1, part);
      place(visible('groupFooter', g.id), { ...base, row: part[part.length - 1], rows: part, rowNumber });
    }
  };

  startPage();
  emit(0, rows);
  place(visible('reportFooter'), { ...base, row: rows[rows.length - 1], rows, rowNumber });

  const footerH = pageFooter && pageFooter.height > 0 ? pageFooter.height : 0;
  if (page.continuous) {
    // Footer right after the content; the page ends at the bottom margin.
    if (footerH) {
      const ctx = { ...base, row: undefined, rows: [], rowNumber };
      cur.bands.push({ band: pageFooter!, top: y, ctx, ...layoutBand(pageFooter!, ctx, false) });
    }
    cur.height = Math.ceil(y + footerH + page.marginBottom);
    return pages;
  }
  if (footerH) {
    const ctx = { ...base, row: undefined, rows: [], rowNumber };
    const layout = layoutBand(pageFooter!, ctx, false);
    for (const p of pages) {
      p.bands.push({ band: pageFooter!, top: page.height - page.marginBottom - footerH, ctx, ...layout });
    }
  }
  return pages;
}

export function contextFor(placed: PlacedBand, page: RenderedPage, totalPages: number): EvalContext {
  const pageScoped = placed.band.type === 'pageHeader' || placed.band.type === 'pageFooter';
  return {
    ...placed.ctx,
    row: pageScoped ? page.rows[0] : placed.ctx.row,
    rows: pageScoped ? page.rows : placed.ctx.rows,
    pageRows: page.rows,
    pageNumber: page.index + 1,
    totalPages,
  };
}
