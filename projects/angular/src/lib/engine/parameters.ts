import type { DataSourceDef, ReportDefinition, ReportParameter } from '../model/types';
import { evaluate, formatValue, truthy, type EvalContext, type Row } from './expressions';

export type ParamValues = Record<string, unknown>;

/** Converts a raw (text) value to the parameter's type. */
export function coerceParam(p: ReportParameter, raw: unknown): unknown {
  if (raw == null || raw === '') return p.type === 'boolean' ? false : null;
  switch (p.type) {
    case 'number': {
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    }
    case 'boolean':
      return raw === true || /^(true|1|yes|on)$/i.test(String(raw));
    default:
      return String(raw); // dates stay ISO "yyyy-MM-dd" text, which compares correctly
  }
}

/** Default values for all parameters, overridden by `overrides` (e.g. from the page URL). */
export function resolveParams(report: ReportDefinition, overrides: Record<string, unknown> = {}): ParamValues {
  const out: ParamValues = {};
  for (const p of report.parameters ?? []) {
    if (!p.name) continue;
    const key = Object.keys(overrides).find((k) => k.toLowerCase() === p.name.toLowerCase());
    out[p.name] = coerceParam(p, key !== undefined ? overrides[key] : p.defaultValue);
  }
  return out;
}

export const paramChoices = (p: ReportParameter) =>
  p.options
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const paramCtx = (params: ParamValues): EvalContext => ({
  row: undefined,
  rows: [],
  allRows: [],
  pageRows: [],
  rowNumber: 0,
  pageNumber: 1,
  totalPages: 1,
  reportName: '',
  params,
});

const NONE = { kind: 'none' as const, decimals: 0, currency: '' };

/** Replaces {…} expressions in a data-source string with parameter values. */
function substitute(text: string, params: ParamValues, encode: boolean): string {
  return text.replace(/\{([^{}]+)\}/g, (_, ex: string) => {
    let v: unknown;
    try {
      v = evaluate(ex, paramCtx(params));
    } catch {
      v = '';
    }
    const s = formatValue(v, NONE);
    return encode ? encodeURIComponent(s) : s;
  });
}

/**
 * Applies parameters to a data source: `{@Country}` in the URL (URL-encoded), OData options,
 * headers and array path. Pasted JSON is left alone (it contains braces of its own).
 */
export function applyParamsToDataSource(ds: DataSourceDef, params: ParamValues): DataSourceDef {
  return {
    ...ds,
    url: substitute(ds.url, params, true),
    entitySet: substitute(ds.entitySet, params, false),
    select: substitute(ds.select, params, false),
    filter: substitute(ds.filter, params, false),
    orderby: substitute(ds.orderby, params, false),
    expand: substitute(ds.expand, params, false),
    headers: substitute(ds.headers, params, false),
    dataPath: substitute(ds.dataPath, params, false),
  };
}

/** Rows that pass the report filter expression (all rows when there is none). */
export function filterRows(report: ReportDefinition, rows: Row[], params: ParamValues): Row[] {
  const f = report.filter?.trim();
  if (!f) return rows;
  const ctx = paramCtx(params);
  return rows.filter((row) => {
    try {
      return truthy(evaluate(f, { ...ctx, row, rows, allRows: rows }));
    } catch {
      return true; // an invalid filter never hides data silently; the designer shows the error
    }
  });
}
