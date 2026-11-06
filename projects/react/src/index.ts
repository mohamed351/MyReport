/**
 * react-my-report — React components for the MyReport designer and viewer.
 *
 *   <MyReportDesigner path="/reports/sales.report.json" onSave={(r) => api.save(r)} />
 *   <MyReportViewer path="/reports/sales.report.json" datasource="/api/orders" type="json" />
 *
 * They wrap the <myreport-designer>/<myreport-viewer> Web Components from elements-my-report,
 * which are loaded on the client only (safe with SSR / Next.js).
 */
import { createElement, forwardRef, useEffect, useImperativeHandle, useRef, type CSSProperties, type ForwardedRef } from 'react';

export type MyReportDataType = 'json' | 'odata';
/** A report definition (.report.json). See angular-my-report for the full typed model. */
export type MyReportDefinition = { version: 1; name: string; bands: unknown[]; [key: string]: unknown };
export type MyReportParams = Record<string, unknown> | string;

interface CommonProps {
  /** URL of the .report.json to open. */
  path?: string;
  /** A report definition (object or JSON string); used when `path` is empty. */
  report?: MyReportDefinition | string | null;
  /**
   * The report's data, replacing its own data source: a URL (JSON file/API, or OData service / entity-set URL),
   * a JSON string, or an array/object. Empty = use the report's data source.
   */
  datasource?: string | unknown[] | Record<string, unknown> | null;
  /** How `datasource` is read: `json` (default) or `odata`. */
  type?: MyReportDataType;
  /** Parameter values: object, JSON string, or query string (`Country=Egypt&Year=2024`). */
  params?: MyReportParams | null;
  /** Fires with the report once it is loaded from `path` / `report`. */
  onLoaded?: (report: MyReportDefinition) => void;
  /** Fires with a message when the report (or the viewer's data) could not be loaded. */
  onLoadError?: (message: string) => void;
  className?: string;
  style?: CSSProperties;
  id?: string;
}

export interface MyReportDesignerProps extends CommonProps {
  /** localStorage key to autosave the report to (and restore from when no path/report is given). */
  persistKey?: string;
  /** Shows a "Viewer ↗" toolbar link to this URL. */
  viewerUrl?: string;
  /** Save downloads a .report.json file (default true). `onSave` fires either way. */
  download?: boolean;
  /** Toolbar title (default "My Report"). */
  brand?: string;
  /** Fires with the report when the user clicks Save. */
  onSave?: (report: MyReportDefinition) => void;
  /** Fires with the report after every change. */
  onReportChange?: (report: MyReportDefinition) => void;
}

export interface MyReportViewerProps extends CommonProps {
  /** Shows a "Designer" toolbar link to this URL. */
  designerUrl?: string;
  /** Shows the Open button for local .report.json files (default true). */
  allowOpen?: boolean;
  /** Fires with the data rows once they are loaded. */
  onDataLoaded?: (rows: Record<string, unknown>[]) => void;
}

let elements: Promise<void> | null = null;

/** Loads elements-my-report (defines the custom elements). Called automatically; exported for preloading. */
export function loadMyReportElements(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  return (elements ??= import('elements-my-report').then(() => window.myreportReady));
}

type Handlers = Record<string, ((detail: any) => void) | undefined>;

/** Renders a custom element, passing props as DOM properties and wiring CustomEvents to callbacks. */
function useReportElement(
  tag: string,
  props: Record<string, unknown>,
  handlers: Handlers,
  common: Pick<CommonProps, 'className' | 'style' | 'id'>,
  ref: ForwardedRef<HTMLElement>,
) {
  const el = useRef<HTMLElement & Record<string, unknown>>(null);
  useImperativeHandle(ref, () => el.current as HTMLElement, []);

  useEffect(() => {
    loadMyReportElements();
  }, []);

  // Properties (objects/arrays can't go through attributes). Values set before the element is
  // upgraded are picked up by Angular Elements when it is.
  const values = Object.values(props);
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    for (const [k, v] of Object.entries(props)) if (v !== undefined && node[k] !== v) node[k] = v;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, values);

  // Events → latest callbacks.
  const latest = useRef(handlers);
  latest.current = handlers;
  const names = Object.keys(handlers).join(',');
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const off = Object.keys(latest.current).map((name) => {
      const fn = (e: Event) => latest.current[name]?.((e as CustomEvent).detail);
      node.addEventListener(name, fn);
      return () => node.removeEventListener(name, fn);
    });
    return () => off.forEach((f) => f());
  }, [names]);

  // Classes go through classList: React 18 writes `className` on custom elements as a literal
  // "classname" attribute, and replacing `class` would drop `myreport`, which the styles are scoped under.
  useEffect(() => {
    const node = el.current;
    const list = (common.className ?? '').split(/\s+/).filter(Boolean);
    if (!node || !list.length) return;
    node.classList.add('myreport', ...list);
    return () => list.forEach((c) => c !== 'myreport' && node.classList.remove(c));
  }, [common.className]);

  return createElement(tag, { ref: el, id: common.id, style: common.style });
}

/** The MyReport report designer. */
export const MyReportDesigner = forwardRef<HTMLElement, MyReportDesignerProps>(function MyReportDesigner(p, ref) {
  return useReportElement(
    'myreport-designer',
    {
      path: p.path ?? null,
      report: p.report ?? null,
      datasource: p.datasource ?? null,
      type: p.type ?? 'json',
      params: p.params ?? null,
      persistKey: p.persistKey ?? null,
      viewerUrl: p.viewerUrl ?? null,
      download: p.download ?? true,
      brand: p.brand ?? 'My Report',
    },
    { save: p.onSave, reportChange: p.onReportChange, loaded: p.onLoaded, loadError: p.onLoadError },
    p,
    ref,
  );
});

/** The MyReport report viewer. */
export const MyReportViewer = forwardRef<HTMLElement, MyReportViewerProps>(function MyReportViewer(p, ref) {
  return useReportElement(
    'myreport-viewer',
    {
      path: p.path ?? null,
      report: p.report ?? null,
      datasource: p.datasource ?? null,
      type: p.type ?? 'json',
      params: p.params ?? null,
      designerUrl: p.designerUrl ?? null,
      allowOpen: p.allowOpen ?? true,
    },
    { loaded: p.onLoaded, loadError: p.onLoadError, dataLoaded: p.onDataLoaded },
    p,
    ref,
  );
});
