import type { DataSourceDef } from '../model/types';
import { emptyDataSource } from '../model/defaults';
import { getPath, type Row } from './expressions';

export type FieldType = 'string' | 'number' | 'boolean' | 'date' | 'object';
export interface FieldInfo {
  name: string;
  type: FieldType;
}
export interface LoadResult {
  rows: Row[];
  fields: FieldInfo[];
  requestUrl: string;
  /** Non-fatal note, e.g. the array path was not found and auto-detect was used. */
  warning?: string;
  /** The whole JSON document (first page for OData), readable in formulas as root.x. */
  root?: unknown;
}

export function parseHeaders(text: string): Record<string, string> {
  const h: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0) h[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return h;
}

export const hasSource = (ds: DataSourceDef) => !!(ds.url.trim() || (ds.type === 'json' && ds.inline.trim()));

export function buildODataUrl(ds: DataSourceDef): string {
  let base = ds.url.trim().replace(/\/+$/, '');
  if (ds.entitySet.trim()) base += '/' + ds.entitySet.trim();
  const q: string[] = [];
  const add = (k: string, v: string) => v.trim() && q.push(`${k}=${encodeURIComponent(v.trim())}`);
  add('$select', ds.select);
  add('$filter', ds.filter);
  add('$orderby', ds.orderby);
  add('$expand', ds.expand);
  if (ds.top) q.push(`$top=${ds.top}`);
  return q.length ? base + (base.includes('?') ? '&' : '?') + q.join('&') : base;
}

async function fetchJson(url: string, headers: Record<string, string>, signal?: AbortSignal): Promise<any> {
  const res = await fetch(url, { headers: { Accept: 'application/json', ...headers }, signal });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} — ${url}`);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Response is not valid JSON — ${url}`);
  }
}

function extractArray(data: unknown, path: string, onWarn: (w: string) => void = () => {}): Row[] {
  let cur: any = path.trim() ? getPath(data, path.trim()) : data;
  // A path that doesn't exist in this response (e.g. left over from another URL) falls back to auto-detect.
  if (cur === undefined && path.trim()) {
    onWarn(`Array path "${path.trim()}" not found in the response; auto-detected the data instead. Clear the Array path field.`);
    cur = data;
    path = '';
  }
  if (Array.isArray(cur)) return cur;
  if (cur && typeof cur === 'object') {
    for (const key of ['value', 'items', 'data', 'results', 'rows', 'records']) {
      if (Array.isArray(cur[key])) return cur[key];
    }
    const firstArray = Object.values(cur).find(Array.isArray);
    if (firstArray) return firstArray as Row[];
    return [cur];
  }
  throw new Error(path ? `No array found at "${path}"` : 'Data is not an array or object');
}

export async function loadData(ds: DataSourceDef, signal?: AbortSignal): Promise<LoadResult> {
  const headers = parseHeaders(ds.headers);
  let rows: Row[];
  let requestUrl = '';
  let warning: string | undefined;
  let root: unknown;

  if (ds.type === 'json') {
    let data: unknown;
    if (ds.inline.trim()) {
      try {
        data = JSON.parse(ds.inline);
      } catch (e) {
        throw new Error('Pasted JSON is invalid: ' + (e as Error).message);
      }
    } else {
      requestUrl = ds.url.trim();
      data = await fetchJson(requestUrl, headers, signal);
    }
    root = data;
    rows = extractArray(data, ds.dataPath, (w) => (warning = w));
  } else {
    requestUrl = buildODataUrl(ds);
    rows = [];
    let next: string | undefined = requestUrl;
    const max = ds.maxRows || 5000;
    while (next && rows.length < max) {
      const json: any = await fetchJson(next, headers, signal);
      root ??= json;
      const page: Row[] = json.value ?? json.d?.results ?? (Array.isArray(json.d) ? json.d : json.d ? [json.d] : []);
      rows.push(...page);
      const link: string | undefined = json['@odata.nextLink'] ?? json['odata.nextLink'] ?? json.d?.__next;
      next = link && !ds.top ? new URL(link, next).toString() : undefined;
    }
    rows = rows.slice(0, max);
  }
  return { rows, fields: inferFields(rows), requestUrl, warning, root };
}

function typeOf(v: unknown): FieldType | null {
  if (v == null) return null;
  if (typeof v === 'number') return 'number';
  if (typeof v === 'boolean') return 'boolean';
  if (typeof v === 'string') {
    if (/^\d{4}-\d{2}-\d{2}([T ][\d:.]+)?(Z|[+-]\d{2}:?\d{2})?$/.test(v) || /^\/Date\(-?\d+/.test(v)) return 'date';
    return 'string';
  }
  return 'object';
}

/** Infers field names (flattening nested objects into dot paths) from a sample of rows. */
export function inferFields(rows: Row[]): FieldInfo[] {
  const types = new Map<string, FieldType | null>();
  const visit = (obj: Record<string, unknown>, prefix: string, depth: number) => {
    for (const [k, v] of Object.entries(obj)) {
      if (k.startsWith('@') || k.startsWith('__')) continue;
      const name = prefix + k;
      if (v && typeof v === 'object' && !Array.isArray(v) && depth < 2) {
        visit(v as Record<string, unknown>, name + '.', depth + 1);
        continue;
      }
      if (Array.isArray(v)) continue;
      const t = typeOf(v);
      if (!types.has(name) || (types.get(name) === null && t)) types.set(name, t);
    }
  };
  for (const r of rows.slice(0, 50)) if (r && typeof r === 'object') visit(r, '', 0);
  return [...types].map(([name, type]) => ({ name, type: type ?? 'string' }));
}

/** Lists entity sets from an OData service ($metadata XML, falling back to the JSON service document). */
export async function loadODataEntitySets(serviceUrl: string, headersText: string): Promise<string[]> {
  const base = serviceUrl.trim().replace(/\/+$/, '');
  const headers = parseHeaders(headersText);
  try {
    const res = await fetch(base + '/$metadata', { headers: { Accept: 'application/xml', ...headers } });
    if (res.ok) {
      const xml = new DOMParser().parseFromString(await res.text(), 'application/xml');
      const sets = [...xml.getElementsByTagNameNS('*', 'EntitySet')].map((n) => n.getAttribute('Name') ?? '').filter(Boolean);
      if (sets.length) return sets;
    }
  } catch {
    /* fall through */
  }
  const doc = await fetchJson(base, headers);
  const list: any[] = doc.value ?? doc.d?.EntitySets ?? [];
  return list.map((x) => (typeof x === 'string' ? x : x.name ?? x.url)).filter(Boolean);
}

export interface DetectedSource {
  dataSource: DataSourceDef;
  /** Human-readable summary of what was detected. */
  note: string;
}

/**
 * Builds a data source from a pasted URL: fetches it once and decides between plain JSON and OData
 * (OData responses carry @odata.context / odata.metadata / a "d" wrapper). An OData service root
 * is resolved to its first entity set. Previous settings (array path, query options) are reset.
 */
export async function detectDataSource(rawUrl: string, headers = ''): Promise<DetectedSource> {
  let url = rawUrl.trim();
  if (!url) throw new Error('Enter a URL');
  url = url.replace(/\/\$metadata\/?$/i, ''); // a $metadata link means the service root
  const base = { ...emptyDataSource(), headers };
  const json: any = await fetchJson(url, parseHeaders(headers));

  const isOData = json && typeof json === 'object' && !Array.isArray(json) && ('@odata.context' in json || 'odata.metadata' in json || 'd' in json);
  if (!isOData) {
    const rows = extractArray(json, '');
    return { dataSource: { ...base, type: 'json', url }, note: `JSON · ${rows.length} rows` };
  }

  // Service document: lists entity sets instead of data rows.
  const ctx: string = json['@odata.context'] ?? json['odata.metadata'] ?? '';
  const v4Sets = /\$metadata$/.test(ctx) && Array.isArray(json.value) ? json.value.filter((x: any) => !x.kind || x.kind === 'EntitySet') : null;
  const v2Sets: string[] | null = Array.isArray(json.d?.EntitySets) ? json.d.EntitySets : null;
  const sets: string[] = v4Sets ? v4Sets.map((x: any) => x.url ?? x.name) : v2Sets ?? [];
  if (sets.length) {
    return {
      dataSource: { ...base, type: 'odata', url: url.replace(/\/+$/, ''), entitySet: sets[0], top: 100 },
      note: `OData service · using entity set "${sets[0]}" (${sets.length} available, first 100 rows) — pick another under Entity set`,
    };
  }
  const rows = json.value ?? json.d?.results ?? json.d;
  return {
    dataSource: { ...base, type: 'odata', url },
    note: `OData · ${Array.isArray(rows) ? rows.length : 1} rows${json['@odata.nextLink'] ? ' (more pages will be fetched)' : ''}`,
  };
}
