import { Injectable, computed, effect, signal, untracked } from '@angular/core';
import type { Band, DataSourceDef, DataSourceType, ReportDefinition, ReportElement } from '../model/types';
import { newReport } from '../model/defaults';
import { hasSource, loadData, type FieldInfo } from '../engine/dataSources';
import { documentFields, type Row } from '../engine/expressions';
import { applyParamsToDataSource, resolveParams } from '../engine/parameters';

export interface Selection {
  elementIds: string[];
  bandId: string | null;
}

export interface DataState {
  rows: Row[];
  /** The whole loaded document (root.x in formulas) and its scalar fields. */
  root?: unknown;
  docFields?: { name: string; type: string }[];
  fields: FieldInfo[];
  status: 'idle' | 'loading' | 'ready' | 'error';
  error?: string;
}

export const GRID = 8;
const HISTORY_LIMIT = 100;

/**
 * Data the host page supplies instead of the report's own data source:
 * a URL (JSON file/API, or OData service / entity-set URL), a JSON string, or the data itself.
 */
export interface DataOverride {
  source: unknown;
  type: DataSourceType;
}

/** Applies a host-supplied data source on top of the report's data source definition. */
export function overrideDataSource(ds: DataSourceDef, o: DataOverride | null): DataSourceDef {
  if (!o || o.source == null || o.source === '') return ds;
  const src = o.source;
  if (typeof src === 'string' && !/^\s*[[{]/.test(src)) {
    const url = src.trim();
    if (o.type === 'odata') {
      // A full entity-set URL (…/Orders) already names the set; don't append the report's entitySet again.
      const path = url.split('?')[0].replace(/\/+$/, '').toLowerCase();
      const set = ds.entitySet.trim().toLowerCase();
      const entitySet = set && path.endsWith('/' + set) ? '' : ds.entitySet;
      return { ...ds, type: 'odata', url, inline: '', entitySet };
    }
    return { ...ds, type: 'json', url, inline: '' };
  }
  // Inline data: a JSON string, or an array/object passed as a property.
  return { ...ds, type: 'json', url: '', inline: typeof src === 'string' ? src : JSON.stringify(src) };
}

function prune(r: ReportDefinition, s: Selection): Selection {
  const ids = new Set(r.bands.flatMap((b) => b.elements.map((e) => e.id)));
  return {
    elementIds: s.elementIds.filter((id) => ids.has(id)),
    bandId: r.bands.some((b) => b.id === s.bandId) ? s.bandId : null,
  };
}

export function findElement(r: ReportDefinition, id: string): { band: Band; el: ReportElement } | null {
  for (const band of r.bands) {
    const el = band.elements.find((e) => e.id === id);
    if (el) return { band, el };
  }
  return null;
}

/**
 * All designer/viewer state: the report (with undo/redo), selection, view options and loaded data.
 * Provided per component (myreport-designer / myreport-viewer), so several can live on one page.
 */
@Injectable()
export class DesignerStore {
  readonly report = signal<ReportDefinition>(newReport());
  readonly selection = signal<Selection>({ elementIds: [], bandId: null });
  readonly zoom = signal(1);
  readonly snap = signal(true);
  readonly data = signal<DataState>({ rows: [], fields: [], status: 'idle' });
  /** localStorage key the report is autosaved to; null = no autosave. */
  readonly persistKey = signal<string | null>(null);
  /** Data supplied by the host page, replacing the report's data source. */
  readonly dataOverride = signal<DataOverride | null>(null);
  /** Parameter values supplied by the host page (below values typed in the parameter bar). */
  readonly externalParams = signal<Record<string, unknown>>({});

  private readonly past = signal<ReportDefinition[]>([]);
  private readonly future = signal<ReportDefinition[]>([]);
  readonly canUndo = computed(() => this.past().length > 0);
  readonly canRedo = computed(() => this.future().length > 0);

  private readonly reloadToken = signal(0);
  /** Values typed in the preview's parameter bar (raw text), on top of host values and defaults. */
  readonly paramInput = signal<Record<string, unknown>>({});
  /** Effective, typed parameter values. */
  readonly params = computed(() => resolveParams(this.report(), { ...this.externalParams(), ...this.paramInput() }));
  /** The data source actually used: the report's own, or the host's override. */
  readonly effectiveDataSource = computed(() => overrideDataSource(this.report().dataSource, this.dataOverride()));
  /** Data source with {@Param} placeholders filled in; reloads when they change. */
  private readonly dsKey = computed(() => JSON.stringify(applyParamsToDataSource(this.effectiveDataSource(), this.params())));

  constructor() {
    // Autosave to the browser (only when a persist key is set).
    effect((onCleanup) => {
      const r = this.report();
      const key = this.persistKey();
      if (!key) return;
      const t = setTimeout(() => {
        try {
          localStorage.setItem(key, JSON.stringify(r));
        } catch {
          /* ignore */
        }
      }, 400);
      onCleanup(() => clearTimeout(t));
    });

    // (Re)load data whenever the data source definition changes.
    effect((onCleanup) => {
      const ds = JSON.parse(this.dsKey());
      this.reloadToken();
      untracked(() => {
        if (!hasSource(ds)) {
          this.data.set({ rows: [], fields: [], status: 'idle' });
          return;
        }
        const ac = new AbortController();
        this.data.update((d) => ({ ...d, status: 'loading', error: undefined }));
        const t = setTimeout(() => {
          loadData(ds, ac.signal)
            .then((res) => this.data.set({ rows: res.rows, fields: res.fields, status: 'ready', root: res.root, docFields: documentFields(res.root) }))
            .catch((e) => {
              if (!ac.signal.aborted) this.data.set({ rows: [], fields: [], status: 'error', error: String(e?.message ?? e) });
            });
        }, 300);
        onCleanup(() => {
          clearTimeout(t);
          ac.abort();
        });
      });
    });
  }

  /** Applies a change to a copy of the report. `history=false` for live drag updates (after `checkpoint()`). */
  update(recipe: (r: ReportDefinition) => void, history = true): void {
    const cur = this.report();
    const next = structuredClone(cur);
    recipe(next);
    if (history) {
      this.past.update((p) => [...p.slice(-HISTORY_LIMIT), cur]);
      this.future.set([]);
    }
    this.report.set(next);
    this.selection.update((s) => prune(next, s));
  }

  checkpoint(): void {
    const cur = this.report();
    this.past.update((p) => [...p.slice(-HISTORY_LIMIT), cur]);
    this.future.set([]);
  }

  undo(): void {
    const p = this.past();
    if (!p.length) return;
    const prev = p[p.length - 1];
    this.future.update((f) => [this.report(), ...f]);
    this.past.set(p.slice(0, -1));
    this.report.set(prev);
    this.selection.update((s) => prune(prev, s));
  }

  redo(): void {
    const [next, ...rest] = this.future();
    if (!next) return;
    this.past.update((p) => [...p, this.report()]);
    this.future.set(rest);
    this.report.set(next);
    this.selection.update((s) => prune(next, s));
  }

  load(r: ReportDefinition): void {
    this.report.set(r);
    this.past.set([]);
    this.future.set([]);
    this.selection.set({ elementIds: [], bandId: null });
  }

  /** Loads the report autosaved under `key` (if any) and keeps autosaving there. */
  restore(key: string): boolean {
    let ok = false;
    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        this.load(JSON.parse(saved));
        ok = true;
      }
    } catch {
      /* ignore */
    }
    this.persistKey.set(key);
    return ok;
  }

  select(s: Selection): void {
    this.selection.set(s);
  }

  snapValue(v: number): number {
    return this.snap() ? Math.round(v / GRID) * GRID : Math.round(v);
  }

  reloadData(): void {
    this.reloadToken.update((n) => n + 1);
  }
}

/** Fetches a .report.json and checks it looks like a report definition. */
export async function fetchReport(path: string, signal?: AbortSignal): Promise<ReportDefinition> {
  const res = await fetch(path, { headers: { Accept: 'application/json' }, signal });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} — ${path}`);
  return validateReport(await res.json());
}

export function validateReport(r: unknown): ReportDefinition {
  const def = r as ReportDefinition;
  if (!def || def.version !== 1 || !Array.isArray(def.bands)) throw new Error('Not a report definition (expected version 1 with bands)');
  return def;
}
