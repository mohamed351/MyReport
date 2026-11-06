/** How a `datasource` URL is read. */
export type MyReportDataType = 'json' | 'odata';

/** A report definition (.report.json). */
export type MyReportDefinition = { version: 1; name: string; bands: unknown[]; [key: string]: unknown };

/** Parameter values: an object, a JSON string, or a query string (`Country=Egypt&Year=2024`). */
export type MyReportParams = Record<string, unknown> | string;

/** A URL (JSON or OData), a JSON string, or the data itself. */
export type MyReportDataSource = string | unknown[] | Record<string, unknown> | null;
