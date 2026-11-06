import type { ElementStyle, ReportDefinition, ReportElement } from '../../model/types';
import { defaultBackground, defaultWatermark } from '../../model/defaults';
import { contextFor, paginate, type PlacedElement } from '../../engine/renderer';
import { evaluate, getPath, renderTemplate, truthy, type EvalContext, type Row } from '../../engine/expressions';
import type { TableRenderData } from '../../engine/table';
import type { ParamValues } from '../../engine/parameters';

export interface ViewItem {
  /** Unique within the document: page:band:element. Used for find highlights. */
  key: string;
  el: ReportElement;
  rows?: Row[];
  top: number;
  height: number;
  content: string;
  tableData?: TableRenderData;
  /** Plain text of the item (content or table cells), for Find. */
  text: string;
}

export interface ViewBand {
  top: number;
  height: number;
  items: ViewItem[];
}

export interface ViewPage {
  index: number;
  height: number;
  background: boolean;
  watermark: boolean;
  bands: ViewBand[];
}

/** Group headers as a navigable tree. */
export interface Bookmark {
  label: string;
  page: number;
  top: number;
  children: Bookmark[];
}

export interface ViewDocument {
  pages: ViewPage[];
  bookmarks: Bookmark[];
  rowCount: number;
  watermarkText: string;
}

const NO_FORMAT = { kind: 'none', decimals: 0, currency: '' } as const;

/** Condition check that treats an invalid expression as "true" (never hides content by accident). */
function holds(expr: string | undefined, ctx: EvalContext): boolean {
  if (!expr?.trim()) return true;
  try {
    return truthy(evaluate(expr, ctx));
  } catch {
    return true;
  }
}

/** Evaluates the visible slice of a table into cell strings. */
function tableData(item: PlacedElement, ctx: EvalContext): TableRenderData | undefined {
  const p = item.table;
  const t = item.el.table;
  if (!p || !t) return undefined;
  const all = ctx.rows;
  return {
    header: p.header ? t.columns.map((c) => renderTemplate(c.header, ctx, NO_FORMAT)) : null,
    headerHeight: p.headerHeight,
    rows: p.rows.map((row, i) => {
      const rctx = { ...ctx, row, rowNumber: p.startIndex + i + 1 };
      return { cells: t.columns.map((c) => renderTemplate(c.text, rctx, c.format)), height: p.rowHeights[i], index: p.startIndex + i };
    }),
    footer: p.footer ? t.columns.map((c) => renderTemplate(c.footer, { ...ctx, rows: all, row: all[all.length - 1] }, c.format)) : null,
    footerHeight: p.footerHeight,
  };
}

function evaluateItem(key: string, it: PlacedElement, ctx: EvalContext, lastValue: Map<string, string>): ViewItem {
  let el: ReportElement = it.el;
  let content = ['line', 'rect', 'table', 'chart'].includes(el.kind) ? '' : renderTemplate(el.text, ctx, el.format);

  const opts = el.fieldOptions;
  if (opts && (el.kind === 'text' || el.kind === 'field')) {
    if (!content.trim() && opts.nullText) content = renderTemplate(opts.nullText, ctx, el.format);
    if (opts.hideDuplicates) {
      if (lastValue.get(el.id) === content) content = '';
      else lastValue.set(el.id, content);
    }
    const rule = opts.rules.find((r) => r.when.trim() && holds(r.when, ctx));
    if (rule) {
      const style: Partial<ElementStyle> = { color: rule.color };
      if (rule.background) style.background = rule.background;
      if (rule.bold) style.bold = true;
      el = { ...el, style: { ...el.style, ...style } };
    }
  }
  // Chart titles may contain fields, e.g. "Sales in {Country}".
  if (el.chart) el = { ...el, chart: { ...el.chart, title: renderTemplate(el.chart.title, ctx, NO_FORMAT) } };

  const td = tableData(it, ctx);
  const text =
    el.kind === 'barcode' || el.kind === 'qrcode' || el.kind === 'image'
      ? ''
      : td
        ? [...(td.header ?? []), ...td.rows.flatMap((r) => r.cells), ...(td.footer ?? [])].join(' ')
        : el.chart?.title ?? content;
  return { key, el, rows: el.kind === 'chart' ? ctx.rows : undefined, top: it.top, height: it.height, content, tableData: td, text };
}

/** Lays out and evaluates the whole report into ready-to-draw pages, plus group bookmarks. */
export function buildDocument(report: ReportDefinition, rows: Row[], params: ParamValues, root: unknown): ViewDocument {
  const layout = paginate(report, rows, params, root);
  const wm = { ...defaultWatermark(), ...report.watermark };
  const bg = { ...defaultBackground(), ...report.background };

  const pages: ViewPage[] = layout.map((pg) => {
    const lastValue = new Map<string, string>(); // hide-duplicates state, per page
    return {
      index: pg.index,
      height: pg.height ?? report.page.height,
      background: bg.enabled && !!bg.image && (bg.pages === 'all' || pg.index === 0),
      watermark: wm.enabled && (wm.kind === 'image' ? !!wm.image : !!wm.text) && (wm.pages === 'all' || pg.index === 0),
      bands: pg.bands.map((pb, bi) => {
        const ctx = contextFor(pb, pg, layout.length);
        return {
          top: pb.top,
          height: pb.height,
          items: pb.items
            .filter((it) => holds(it.el.visibleWhen, ctx))
            .map((it) => evaluateItem(`${pg.index}:${bi}:${it.el.id}`, it, ctx, lastValue)),
        };
      }),
    };
  });

  // Bookmarks: one per group header, nested by group level.
  const bookmarks: Bookmark[] = [];
  const stack: Bookmark[] = [];
  for (const pg of layout) {
    for (const pb of pg.bands) {
      if (pb.band.type !== 'groupHeader' || !pb.band.groupId) continue;
      const level = report.groups.findIndex((g) => g.id === pb.band.groupId);
      if (level < 0) continue;
      const g = report.groups[level];
      const bm: Bookmark = { label: String(getPath(pb.ctx.row, g.field) ?? '(blank)'), page: pg.index, top: pb.top, children: [] };
      stack.length = level;
      (level > 0 && stack[level - 1] ? stack[level - 1].children : bookmarks).push(bm);
      stack[level] = bm;
    }
  }

  const ctx: EvalContext = { row: undefined, rows: [], allRows: [], pageRows: [], rowNumber: 0, pageNumber: 1, totalPages: 1, reportName: report.name, params, root };
  return {
    pages,
    bookmarks,
    rowCount: layout.reduce((n, p) => n + p.rows.length, 0),
    watermarkText: renderTemplate(wm.text, ctx, NO_FORMAT),
  };
}
