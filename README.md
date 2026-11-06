# MyReport

A banded report **designer** and **viewer** that runs in the browser. Design a report visually, save it as a `.report.json` file, and show it in your app with live data from a JSON API, an OData service, or data you already have.

It ships as four npm packages from one codebase, so it works in Angular, React, Vue, Svelte, plain HTML and anything else that can render a Web Component.

| Package | For | Version |
|---|---|---|
| [`angular-my-report`](projects/angular) | Angular 18.1 – 22 (native, zoneless-ready) | [![npm](https://img.shields.io/npm/v/angular-my-report.svg)](https://www.npmjs.com/package/angular-my-report) |
| [`angular-my-report-legacy`](projects/angular-legacy) | Angular 13 – 22 | [![npm](https://img.shields.io/npm/v/angular-my-report-legacy.svg)](https://www.npmjs.com/package/angular-my-report-legacy) |
| [`react-my-report`](projects/react) | React 17, 18, 19 and Next.js | [![npm](https://img.shields.io/npm/v/react-my-report.svg)](https://www.npmjs.com/package/react-my-report) |
| [`elements-my-report`](projects/elements) | Web Components: Vue, Svelte, Blazor, ASP.NET, PHP, plain HTML | [![npm](https://img.shields.io/npm/v/elements-my-report.svg)](https://www.npmjs.com/package/elements-my-report) |

Each package has its own README with the full API.

## Features

- **Banded layout**: report header, page header, group headers, detail, group footers, page footer and report footer.
- **Elements**: text, data fields, lines, rectangles, images, tables, charts (bar, horizontal bar, line, area, pie, doughnut), crosstabs, barcodes (Code 128, EAN-13) and QR codes.
- **Expressions**: `{Field}`, `{sum(Amount)}`, `Page {PageNumber} of {TotalPages}`, `iif(...)`, string, number and date functions, and number, currency, percent and date formats.
- **Data**: JSON files and APIs, OData v2/v4 (with `nextLink` paging), or arrays you pass in.
- **Parameters**: pass values from your app or let users change them in the viewer's parameter bar.
- **Viewer**: paging, zoom, find, bookmarks, thumbnails, print, and export to PDF (via print), HTML, CSV and `.report.json`.
- **Templates**: a sales sample, a blank report, and 80 mm / 58 mm receipt layouts for thermal printers.
- **Self-contained styles**: scoped under `.myreport`, with no stylesheet to import.

## Quick look

Angular:

```html
<myreport-designer persistKey="my-report" (save)="save($event)" />
<myreport-viewer path="/reports/sales.report.json" datasource="/api/orders" type="json" />
```

React:

```tsx
<MyReportViewer path="/reports/sales.report.json" datasource="/api/orders" style={{ height: '100vh' }} />
```

Plain HTML, no build step:

```html
<myreport-viewer path="/reports/sales.report.json" style="display: block; height: 100vh"></myreport-viewer>
<script src="https://cdn.jsdelivr.net/npm/elements-my-report/myreport-elements.js"></script>
```

Both components fill their container, so give them a height.

## Repository layout

```
projects/
  angular/          Core library: report model, rendering engine, designer and viewer UI
    src/lib/engine/   expressions, data sources, renderer, charts, tables, crosstabs, barcodes, QR
    src/lib/model/    report types, defaults and factories (sample and receipt templates)
    src/lib/ui/       designer and viewer components
  elements/         Wraps the Angular library as Web Components (single self-contained script)
  react/            React wrapper around the Web Components
  angular-legacy/   Angular 13+ wrapper around the Web Components
src/                Demo app (designer and viewer)
public/samples/     Sample data: orders.json, receipt.json
scripts/            Build scripts for the elements and legacy packages
```

The Angular library is the source of truth. The other three packages build on top of it.

## Development

Requirements: Node.js 18.19 or later and npm.

```bash
npm install
npm start
```

Open `http://localhost:4200`:

- `/` is the designer. It starts with the sales sample and autosaves to `localStorage`.
- `/viewer` is the viewer. It shows the designer's current report, or takes query options:
  - `?template=sales|blank|receipt80|receipt58`
  - `?report=<url to a .report.json>`
  - `?datasource=<url>&type=json|odata`
  - any other key is passed as a report parameter, for example `?template=sales&Country=Egypt`

### Building the packages

| Command | Output |
|---|---|
| `npm run build` | Demo app → `dist/report-designer` |
| `npm run build:angular` | `dist/angular` |
| `npm run build:elements` | `dist/elements` |
| `npm run build:react` | `dist/react` |
| `npm run build:angular-legacy` | `dist/angular-legacy` |
| `npm run build:packages` | All four, in dependency order |
| `npm run pack:packages` | All four, plus an `npm pack` tarball for each |

Build `angular` before `elements`, and `elements` before `react` and `angular-legacy`. `build:packages` does this for you.

## License

MIT
