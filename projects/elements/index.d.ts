/**
 * elements-my-report — importing this module (or loading myreport-elements.js with a <script> tag)
 * defines <myreport-designer> and <myreport-viewer>.
 */

export type MyReportDataType = 'json' | 'odata';

/** A report definition (.report.json). See angular-my-report for the full typed model. */
export type MyReportDefinition = { version: 1; name: string; bands: unknown[]; [key: string]: unknown };

export interface MyReportDesignerElement extends HTMLElement {
  /** URL of a .report.json to open. */
  path: string | null;
  /** A report definition (object or JSON string); used when `path` is empty. */
  report: MyReportDefinition | string | null;
  /** Replaces the report's data source while designing: URL, JSON string, or array/object. */
  datasource: unknown;
  /** How `datasource` is read (default `json`). */
  type: MyReportDataType;
  /** Parameter values: object, JSON string or query string. */
  params: Record<string, unknown> | string | null;
  /** localStorage key to autosave to / restore from. */
  persistKey: string | null;
  /** Shows a "Viewer ↗" toolbar link to this URL. */
  viewerUrl: string | null;
  /** Save downloads a .report.json (default true); the `save` event fires either way. */
  download: boolean;
  /** Toolbar title (default "My Report"). */
  brand: string | null;
}

export interface MyReportViewerElement extends HTMLElement {
  /** URL of the .report.json to show. */
  path: string | null;
  /** A report definition (object or JSON string); used when `path` is empty. */
  report: MyReportDefinition | string | null;
  /** The report's data: URL (JSON or OData), JSON string, or array/object. Empty = the report's own data source. */
  datasource: unknown;
  /** How `datasource` is read (default `json`). */
  type: MyReportDataType;
  /** Parameter values: object, JSON string or query string. */
  params: Record<string, unknown> | string | null;
  /** Shows a "Designer" toolbar link to this URL. */
  designerUrl: string | null;
  /** Shows the Open button for local .report.json files (default true). */
  allowOpen: boolean;
}

/**
 * Events (CustomEvent, value in `detail`):
 *  designer: save, reportChange, loaded (MyReportDefinition) · loadError (string)
 *  viewer:   loaded (MyReportDefinition) · dataLoaded (rows) · loadError (string)
 */
declare global {
  interface HTMLElementTagNameMap {
    'myreport-designer': MyReportDesignerElement;
    'myreport-viewer': MyReportViewerElement;
  }
  interface Window {
    /** Resolves once both elements are defined. */
    myreportReady?: Promise<void>;
  }
}
