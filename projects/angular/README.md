# angular-my-report

[![npm](https://img.shields.io/npm/v/angular-my-report.svg)](https://www.npmjs.com/package/angular-my-report)
[![license](https://img.shields.io/npm/l/angular-my-report.svg)](https://www.npmjs.com/package/angular-my-report)

A banded report **designer** and **viewer** for Angular, shipped as two standalone components: `<myreport-designer>` and `<myreport-viewer>`.

Design a report in the browser, save it as a `.report.json` file, and show it in your app with live data from a JSON API, an OData service, or data you already have.

## Features

- **Banded layout**: report header, page header, group headers, detail, group footers, page footer and report footer.
- **Elements**: text, data fields, lines, rectangles, images, tables, charts (bar, horizontal bar, line, area, pie, doughnut), crosstabs, barcodes (Code 128, EAN-13) and QR codes.
- **Expressions**: `{Field}`, `{sum(Amount)}`, `{PageNumber} of {TotalPages}`, `iif(...)`, string, number and date functions, and number, currency, percent and date formats.
- **Data**: JSON files and APIs, OData v2/v4 (with paging), or arrays you pass in.
- **Parameters**: bind values from your app or let users change them in the viewer.
- **Viewer**: paging, zoom, find, bookmarks, thumbnails, print, and export to PDF (via print), HTML, CSV and `.report.json`.
- **Self-contained styles**: scoped under `.myreport`, with no stylesheet to import and nothing leaking into your app.

## Install

```bash
npm install angular-my-report
```

### Supported Angular versions

| Angular | Supported |
|---|---|
| 18.1 – 22.x | ✅ This package. Works with zone.js and zoneless apps. |
| 13 – 18.0 | Use [`angular-my-report-legacy`](https://www.npmjs.com/package/angular-my-report-legacy), which works on every version from 13 to 22. |

## Quick start

### 1. Design a report

```ts
import { Component } from '@angular/core';
import { MyReportDesignerComponent, type ReportDefinition } from 'angular-my-report';

@Component({
  selector: 'app-designer-page',
  imports: [MyReportDesignerComponent],
  template: `<myreport-designer persistKey="my-report" (save)="save($event)" />`,
  styles: `myreport-designer { display: block; height: 100vh; }`,
})
export class DesignerPage {
  save(report: ReportDefinition) {
    // Send it to your API, or keep the .report.json file the Save button downloads.
  }
}
```

### 2. Show the report

Put the saved file in your app's `public/reports/` folder, then:

```ts
import { Component } from '@angular/core';
import { MyReportViewerComponent } from 'angular-my-report';

@Component({
  selector: 'app-sales-report',
  imports: [MyReportViewerComponent],
  template: `<myreport-viewer path="/reports/sales.report.json" datasource="/api/orders" type="json" />`,
  styles: `myreport-viewer { display: block; height: 100vh; }`,
})
export class SalesReportPage {}
```

Both components fill their container, so give them a height.

## Viewer

```html
<!-- The report's own data source -->
<myreport-viewer path="/reports/sales.report.json" />

<!-- JSON from your API -->
<myreport-viewer path="/reports/sales.report.json" datasource="/api/orders" type="json" />

<!-- OData: service root or full entity-set URL -->
<myreport-viewer path="/reports/orders.report.json" datasource="https://host/odata/Orders" type="odata" />

<!-- Data you already have, with parameters -->
<myreport-viewer path="/reports/sales.report.json" [datasource]="orders" [params]="{ Country: 'Egypt' }" />
```

| Input | Type | Description |
|---|---|---|
| `path` | `string` | URL of the `.report.json` to show. |
| `report` | `ReportDefinition \| string` | A report to show (object or JSON). Used when `path` is empty. |
| `datasource` | `string \| array \| object` | The report's data. See [Data](#data). |
| `type` | `'json' \| 'odata'` | How a `datasource` URL is read. Default `json`. |
| `params` | `object \| string` | Parameter values. See [Parameters](#parameters). |
| `designerUrl` | `string` | Shows a "Designer" toolbar link to this URL. |
| `allowOpen` | `boolean` | Shows the toolbar Open button for local `.report.json` files. Default `true`. |

| Output | Payload |
|---|---|
| `loaded` | `ReportDefinition` |
| `dataLoaded` | The data rows |
| `loadError` | `string`, when the report or its data fails to load |

## Designer

```html
<myreport-designer
  path="/reports/sales.report.json"
  datasource="/api/orders"
  [download]="false"
  (save)="save($event)" />
```

| Input | Type | Description |
|---|---|---|
| `path` | `string` | URL of a `.report.json` to open. |
| `report` | `ReportDefinition \| string` | A report to open (object or JSON). Used when `path` is empty. |
| `datasource` | `string \| array \| object` | Data to design against, replacing the report's data source. See [Data](#data). |
| `type` | `'json' \| 'odata'` | How a `datasource` URL is read. Default `json`. |
| `params` | `object \| string` | Parameter values. See [Parameters](#parameters). |
| `persistKey` | `string` | `localStorage` key to autosave to. When `path` and `report` are empty, the saved report is restored from it. |
| `viewerUrl` | `string` | Shows a "Viewer ↗" toolbar link to this URL. |
| `download` | `boolean` | Whether **Save** downloads a `.report.json`. Default `true`. `(save)` fires either way. |
| `brand` | `string` | Toolbar title. Default `My Report`. |

| Output | Payload |
|---|---|
| `save` | `ReportDefinition`, when the user clicks Save |
| `reportChange` | `ReportDefinition`, after every edit |
| `loaded` | `ReportDefinition`, after `path` loads |
| `loadError` | `string` |

## Data

`datasource` replaces the data source saved in the report. Leave it empty to use the report's own.

- **URL with `type="json"`**: fetched as JSON. The array path saved in the report (for example `data.items`) still applies. If that path isn't in the response, the array is found automatically.
- **URL with `type="odata"`**: an OData v2/v4 service root or entity-set URL. The report's entity set, `$select`, `$filter`, `$orderby`, `$expand` and `$top` still apply, and `nextLink` paging is followed.
- **JSON string, array or object**: used as the data directly.

Request headers (for example `Authorization`) come from the report's data source settings.

## Parameters

Pass values as an object (`{ Country: 'Egypt' }`), a JSON string, or a query string (`Country=Egypt&Year=2024`). They fill the report's parameters, are available as `@Country` in expressions and as `{@Country}` in data source URLs, and can be changed in the viewer's parameter bar.

## Expressions

Text elements are templates. Anything inside `{ }` is evaluated:

| Example | Result |
|---|---|
| `{CustomerName}` | A field from the current row |
| `{sum(Amount)}` | Total for the current group, or for all rows in report bands |
| `{sum(Amount, report)}` | Total over all rows (scopes: `group`, `page`, `report`) |
| `{count()}`, `{avg(Price)}`, `{distinctcount(City)}` | Other aggregates: `min`, `max`, `first`, `last` |
| `Page {PageNumber} of {TotalPages}` | Page numbers |
| `{RowNumber}`, `{Today}`, `{Now}`, `{ReportName}` | Built-in values |
| `{iif(Amount > 1000, 'Large', 'Small')}` | Conditions |
| `{upper(Name)}`, `{formatdate(OrderDate, 'dd/MM/yyyy')}` | String and date functions |
| `{@Country}` | A parameter value |

## Working with reports in code

The report model and helpers are exported as well:

```ts
import {
  newReport, sampleReport, receiptReport,   // start a report (receiptReport(80) or receiptReport(58) for receipt printers)
  loadData, detectDataSource,               // load data the way the viewer does
  overrideDataSource,                       // swap a report's data source
  type ReportDefinition, type Band, type ReportElement,
} from 'angular-my-report';
```

## Other frameworks

- **React**: [`react-my-report`](https://www.npmjs.com/package/react-my-report)
- **Vue, Svelte, plain HTML or anything else** (Web Components): [`elements-my-report`](https://www.npmjs.com/package/elements-my-report)

## License

MIT
