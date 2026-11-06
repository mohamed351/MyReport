# elements-my-report

[![npm](https://img.shields.io/npm/v/elements-my-report.svg)](https://www.npmjs.com/package/elements-my-report)
[![license](https://img.shields.io/npm/l/elements-my-report.svg)](https://www.npmjs.com/package/elements-my-report)

A banded report **designer** and **viewer** as standard Web Components: `<myreport-designer>` and `<myreport-viewer>`.

Use them with Vue, Svelte, Blazor, ASP.NET, PHP, plain HTML or any other stack. For React, use [`react-my-report`](https://www.npmjs.com/package/react-my-report). For Angular, use [`angular-my-report`](https://www.npmjs.com/package/angular-my-report) (Angular 18.1+) or [`angular-my-report-legacy`](https://www.npmjs.com/package/angular-my-report-legacy) (Angular 13+).

## Features

- **Banded layout**: report header, page header, group headers, detail, group footers, page footer and report footer.
- **Elements**: text, data fields, lines, rectangles, images, tables, charts, crosstabs, barcodes and QR codes.
- **Data**: JSON files and APIs, OData v2/v4 (with paging), or arrays you pass in.
- **Viewer**: paging, zoom, find, bookmarks, thumbnails, parameters, print, and export to PDF (via print), HTML, CSV and `.report.json`.
- **One file**: a single self-contained script (about 145 kB gzipped) with scoped styles and no CSS to import.

## Install

### With a bundler

```bash
npm install elements-my-report
```

```js
import 'elements-my-report'; // defines <myreport-designer> and <myreport-viewer>
```

### With a script tag (no build step)

```html
<script src="https://cdn.jsdelivr.net/npm/elements-my-report/myreport-elements.js"></script>
```

To pin a version, use a URL like `https://cdn.jsdelivr.net/npm/elements-my-report@0.1.0/myreport-elements.js`.

## Quick start

```html
<!doctype html>
<html>
  <body style="margin: 0">
    <myreport-viewer
      path="/reports/sales.report.json"
      datasource="/api/orders"
      type="json"
      style="display: block; height: 100vh">
    </myreport-viewer>

    <script src="https://cdn.jsdelivr.net/npm/elements-my-report/myreport-elements.js"></script>
  </body>
</html>
```

To create the `.report.json` file, open the designer:

```html
<myreport-designer persist-key="my-report" style="display: block; height: 100vh"></myreport-designer>
```

Click **Save** to download the report, then put the file where your viewer page can load it. Both elements fill their container, so give them a height.

## Viewer

```html
<!-- The report's own data source -->
<myreport-viewer path="/reports/sales.report.json"></myreport-viewer>

<!-- JSON from your API -->
<myreport-viewer path="/reports/sales.report.json" datasource="/api/orders" type="json"></myreport-viewer>

<!-- OData: service root or full entity-set URL -->
<myreport-viewer path="/reports/orders.report.json" datasource="https://host/odata/Orders" type="odata"></myreport-viewer>
```

| Attribute / property | Type | Description |
|---|---|---|
| `path` | `string` | URL of the `.report.json` to show. |
| `report` | `object \| string` | A report to show (object or JSON). Used when `path` is empty. |
| `datasource` | `string \| array \| object` | The report's data. See [Data](#data). |
| `type` | `'json' \| 'odata'` | How a `datasource` URL is read. Default `json`. |
| `params` | `object \| string` | Parameter values. See [Parameters](#parameters). |
| `designer-url` / `designerUrl` | `string` | Shows a "Designer" toolbar link to this URL. |
| `allow-open` / `allowOpen` | `boolean` | Shows the toolbar Open button for local `.report.json` files. Default `true`. |

Events: `loaded` (the report), `dataLoaded` (the data rows), `loadError` (a message).

## Designer

```html
<myreport-designer path="/reports/sales.report.json" download="false"></myreport-designer>
```

| Attribute / property | Type | Description |
|---|---|---|
| `path` | `string` | URL of a `.report.json` to open. |
| `report` | `object \| string` | A report to open. Used when `path` is empty. |
| `datasource`, `type`, `params` | | Same as the viewer: data to design against. |
| `persist-key` / `persistKey` | `string` | `localStorage` key to autosave to, and to restore from when nothing else is given. |
| `viewer-url` / `viewerUrl` | `string` | Shows a "Viewer ↗" toolbar link to this URL. |
| `download` | `boolean` | Whether **Save** downloads a `.report.json`. Default `true`. The `save` event fires either way. |
| `brand` | `string` | Toolbar title. Default `My Report`. |

Events: `save` (the report), `reportChange` (the report, after every edit), `loaded` (the report), `loadError` (a message).

## Properties and events in JavaScript

Use dash-case for attributes and camelCase for properties. Objects and arrays, such as data or a report object, must be set as properties:

```js
const viewer = document.querySelector('myreport-viewer');
viewer.datasource = orders;
viewer.params = { Country: 'Egypt' };
viewer.addEventListener('dataLoaded', (e) => console.log(e.detail.length, 'rows'));

const designer = document.querySelector('myreport-designer');
designer.addEventListener('save', async (e) => {
  await fetch('/api/reports/sales', { method: 'PUT', body: JSON.stringify(e.detail) });
});
```

Events are `CustomEvent`s with the value in `detail`. `window.myreportReady` is a promise that resolves once both elements are defined.

## Vue example

```vue
<script setup>
import 'elements-my-report';
const orders = [{ Customer: 'Acme', Amount: 1200 }];
</script>

<template>
  <myreport-viewer path="/reports/sales.report.json" :datasource.prop="orders" style="display: block; height: 100vh" />
</template>
```

In Vue, tell the compiler these are custom elements: `compilerOptions.isCustomElement = (tag) => tag.startsWith('myreport-')`.

## Data

`datasource` replaces the data source saved in the report. Leave it empty to use the report's own.

- **URL with `type="json"`**: fetched as JSON. The array path saved in the report (for example `data.items`) still applies. If that path isn't in the response, the array is found automatically.
- **URL with `type="odata"`**: an OData v2/v4 service root or entity-set URL. The report's entity set, `$select`, `$filter`, `$orderby`, `$expand` and `$top` still apply, and `nextLink` paging is followed.
- **JSON string, array or object**: used as the data directly.

Request headers (for example `Authorization`) come from the report's data source settings.

## Parameters

Pass values as an object (`{ Country: 'Egypt' }`), a JSON string, or a query string (`Country=Egypt&Year=2024`). They fill the report's parameters, are available as `@Country` in expressions and as `{@Country}` in data source URLs, and can be changed in the viewer's parameter bar.

## TypeScript

Types are included. `document.querySelector('myreport-viewer')` returns a typed `MyReportViewerElement`, and `MyReportDesignerElement` and `MyReportDefinition` are exported.

## Notes

The bundle contains Angular and zone.js internally. zone.js patches browser async APIs on the page, which other frameworks normally don't notice.

## License

MIT
