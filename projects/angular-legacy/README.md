# angular-my-report-legacy

[![npm](https://img.shields.io/npm/v/angular-my-report-legacy.svg)](https://www.npmjs.com/package/angular-my-report-legacy)
[![license](https://img.shields.io/npm/l/angular-my-report-legacy.svg)](https://www.npmjs.com/package/angular-my-report-legacy)

A banded report **designer** and **viewer** for **every Angular version from 13 to 22**: `<my-report-designer>` and `<my-report-viewer>`.

Design a report in the browser, save it as a `.report.json` file, and show it in your app with live data from a JSON API, an OData service, or data you already have.

## Which package should I use?

| Your Angular version | Package |
|---|---|
| 13 – 18.0 | **This package** |
| 18.1 or later | [`angular-my-report`](https://www.npmjs.com/package/angular-my-report) is smaller and fully native. This package also works there. |

This package wraps the [`elements-my-report`](https://www.npmjs.com/package/elements-my-report) Web Components, which bring their own copy of Angular. That copy is why it works with any version of Angular. The report code is only downloaded when a report is first shown. It adds about 145 kB gzipped.

Tested on Angular 13, 16 and 22 (zoneless).

## Install

```bash
npm install angular-my-report-legacy
```

## Setup

Import `MyReportModule`.

**NgModule apps** (Angular 13 and later):

```ts
import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { MyReportModule } from 'angular-my-report-legacy';
import { AppComponent } from './app.component';

@NgModule({
  declarations: [AppComponent],
  imports: [BrowserModule, MyReportModule],
  bootstrap: [AppComponent],
})
export class AppModule {}
```

**Standalone components** (Angular 14 and later):

```ts
import { Component } from '@angular/core';
import { MyReportModule } from 'angular-my-report-legacy';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [MyReportModule],
  templateUrl: './reports.component.html',
})
export class ReportsComponent {}
```

## Quick start

### 1. Design a report

```html
<my-report-designer persistKey="my-report" (save)="onSave($event)" style="height: 100vh"></my-report-designer>
```

```ts
onSave(report: MyReportDefinition) {
  // Send it to your API, or keep the .report.json file the Save button downloads.
}
```

### 2. Show the report

Put the saved file somewhere your app serves it. In Angular 13–16 that's `src/assets/`, and in Angular 17 and later it's `public/`. Then:

```html
<my-report-viewer path="/assets/reports/sales.report.json" datasource="/api/orders" type="json" style="height: 100vh"></my-report-viewer>
```

Both components fill their container, so give them a height.

## Viewer

```html
<!-- The report's own data source -->
<my-report-viewer path="/assets/reports/sales.report.json"></my-report-viewer>

<!-- OData: service root or full entity-set URL -->
<my-report-viewer path="/assets/reports/orders.report.json" datasource="https://host/odata/Orders" type="odata"></my-report-viewer>

<!-- Data you already have, with parameters -->
<my-report-viewer path="/assets/reports/sales.report.json" [datasource]="orders" [params]="{ Country: 'Egypt' }"></my-report-viewer>
```

| Input | Type | Description |
|---|---|---|
| `path` | `string` | URL of the `.report.json` to show. |
| `report` | `MyReportDefinition \| string` | A report to show (object or JSON). Used when `path` is empty. |
| `datasource` | `string \| array \| object` | The report's data. See [Data](#data). |
| `type` | `'json' \| 'odata'` | How a `datasource` URL is read. Default `json`. |
| `params` | `object \| string` | Parameter values. See [Parameters](#parameters). |
| `designerUrl` | `string` | Shows a "Designer" toolbar link to this URL. |
| `allowOpen` | `boolean` | Shows the toolbar Open button for local `.report.json` files. Default `true`. |

| Output | Payload |
|---|---|
| `loaded` | `MyReportDefinition` |
| `dataLoaded` | The data rows |
| `loadError` | `string`, when the report or its data fails to load |

## Designer

```html
<my-report-designer
  path="/assets/reports/sales.report.json"
  [download]="false"
  (save)="onSave($event)"
  style="height: 100vh">
</my-report-designer>
```

| Input | Type | Description |
|---|---|---|
| `path` | `string` | URL of a `.report.json` to open. |
| `report` | `MyReportDefinition \| string` | A report to open. Used when `path` is empty. |
| `datasource`, `type`, `params` | | Same as the viewer: data to design against. |
| `persistKey` | `string` | `localStorage` key to autosave to, and to restore from when nothing else is given. |
| `viewerUrl` | `string` | Shows a "Viewer ↗" toolbar link to this URL. |
| `download` | `boolean` | Whether **Save** downloads a `.report.json`. Default `true`. `(save)` fires either way. |
| `brand` | `string` | Toolbar title. Default `My Report`. |

| Output | Payload |
|---|---|
| `save` | `MyReportDefinition`, when the user clicks Save |
| `reportChange` | `MyReportDefinition`, after every edit |
| `loaded` | `MyReportDefinition` |
| `loadError` | `string` |

## Data

`datasource` replaces the data source saved in the report. Leave it empty to use the report's own.

- **URL with `type="json"`**: fetched as JSON. The array path saved in the report (for example `data.items`) still applies. If that path isn't in the response, the array is found automatically.
- **URL with `type="odata"`**: an OData v2/v4 service root or entity-set URL. The report's entity set, `$select`, `$filter`, `$orderby`, `$expand` and `$top` still apply, and `nextLink` paging is followed.
- **JSON string, array or object**: used as the data directly.

Request headers (for example `Authorization`) come from the report's data source settings.

## Parameters

Pass values as an object (`{ Country: 'Egypt' }`), a JSON string, or a query string (`Country=Egypt&Year=2024`). They fill the report's parameters, are available as `@Country` in expressions and as `{@Country}` in data source URLs, and can be changed in the viewer's parameter bar.

## Preloading

The report code downloads the first time a viewer or designer is shown. To start the download earlier, call `loadMyReportElements()`, for example when the user hovers over a link:

```ts
import { loadMyReportElements } from 'angular-my-report-legacy';

loadMyReportElements();
```

## TypeScript

Types are included: `MyReportDefinition`, `MyReportDataType`, `MyReportParams` and `MyReportDataSource`.

## Other frameworks

- **Angular 18.1 or later**: [`angular-my-report`](https://www.npmjs.com/package/angular-my-report)
- **React**: [`react-my-report`](https://www.npmjs.com/package/react-my-report)
- **Vue, Svelte, plain HTML or anything else** (Web Components): [`elements-my-report`](https://www.npmjs.com/package/elements-my-report)

## License

MIT
