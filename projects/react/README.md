# react-my-report

[![npm](https://img.shields.io/npm/v/react-my-report.svg)](https://www.npmjs.com/package/react-my-report)
[![license](https://img.shields.io/npm/l/react-my-report.svg)](https://www.npmjs.com/package/react-my-report)

A banded report **designer** and **viewer** for React: `<MyReportDesigner>` and `<MyReportViewer>`.

Design a report in the browser, save it as a `.report.json` file, and show it in your app with live data from a JSON API, an OData service, or data you already have.

## Features

- **Banded layout**: report header, page header, group headers, detail, group footers, page footer and report footer.
- **Elements**: text, data fields, lines, rectangles, images, tables, charts, crosstabs, barcodes and QR codes.
- **Data**: JSON files and APIs, OData v2/v4 (with paging), or arrays you pass in.
- **Viewer**: paging, zoom, find, bookmarks, thumbnails, parameters, print, and export to PDF (via print), HTML, CSV and `.report.json`.
- **Works anywhere React does**: React 17, 18 and 19, Vite, Create React App and Next.js (SSR-safe).

## Install

```bash
npm install react-my-report
```

Your app doesn't need Angular. The components wrap the [`elements-my-report`](https://www.npmjs.com/package/elements-my-report) Web Components, which are installed automatically and only load in the browser. Styles come with the components and are scoped, so there's no CSS to import.

## Quick start

### 1. Design a report

```tsx
import { MyReportDesigner } from 'react-my-report';

export function DesignerPage() {
  return (
    <MyReportDesigner
      persistKey="my-report"
      onSave={(report) => console.log(report)}
      style={{ height: '100vh' }}
    />
  );
}
```

Click **Save** to download a `.report.json`, then put it in your app's `public/reports/` folder.

### 2. Show the report

```tsx
import { MyReportViewer } from 'react-my-report';

export function SalesReport() {
  return (
    <MyReportViewer
      path="/reports/sales.report.json"
      datasource="/api/orders"
      type="json"
      style={{ height: '100vh' }}
    />
  );
}
```

Both components fill their container, so give them a height.

## Viewer

```tsx
// The report's own data source
<MyReportViewer path="/reports/sales.report.json" />

// OData: service root or full entity-set URL
<MyReportViewer path="/reports/orders.report.json" datasource="https://host/odata/Orders" type="odata" />

// Data you already have, with parameters
<MyReportViewer path="/reports/sales.report.json" datasource={orders} params={{ Country: 'Egypt' }} />
```

| Prop | Type | Description |
|---|---|---|
| `path` | `string` | URL of the `.report.json` to show. |
| `report` | `object \| string` | A report to show (object or JSON). Used when `path` is empty. |
| `datasource` | `string \| array \| object` | The report's data. See [Data](#data). |
| `type` | `'json' \| 'odata'` | How a `datasource` URL is read. Default `json`. |
| `params` | `object \| string` | Parameter values. See [Parameters](#parameters). |
| `designerUrl` | `string` | Shows a "Designer" toolbar link to this URL. |
| `allowOpen` | `boolean` | Shows the toolbar Open button. Default `true`. |
| `onLoaded` | `(report) => void` | The report has loaded. |
| `onDataLoaded` | `(rows) => void` | The data has loaded. |
| `onLoadError` | `(message) => void` | The report or its data failed to load. |
| `className`, `style`, `id` | | Applied to the element. |

## Designer

```tsx
<MyReportDesigner
  path="/reports/sales.report.json"
  download={false}
  onSave={(report) =>
    fetch('/api/reports/sales', { method: 'PUT', body: JSON.stringify(report) })
  }
  style={{ height: '100vh' }}
/>
```

| Prop | Type | Description |
|---|---|---|
| `path` | `string` | URL of a `.report.json` to open. |
| `report` | `object \| string` | A report to open. Used when `path` is empty. |
| `datasource`, `type`, `params` | | Same as the viewer: data to design against. |
| `persistKey` | `string` | `localStorage` key to autosave to, and to restore from when nothing else is given. |
| `viewerUrl` | `string` | Shows a "Viewer ↗" toolbar link to this URL. |
| `download` | `boolean` | Whether **Save** downloads a `.report.json`. Default `true`. `onSave` fires either way. |
| `brand` | `string` | Toolbar title. Default `My Report`. |
| `onSave` | `(report) => void` | The user clicked Save. |
| `onReportChange` | `(report) => void` | Fires after every edit. |
| `onLoaded`, `onLoadError` | | Same as the viewer. |
| `className`, `style`, `id` | | Applied to the element. |

## Refs and preloading

`ref` gives you the underlying `<myreport-designer>` or `<myreport-viewer>` element.

The components load on first render. To start downloading them earlier, for example when the user hovers over a link, call `loadMyReportElements()`:

```tsx
import { loadMyReportElements } from 'react-my-report';

<Link to="/reports" onMouseEnter={() => loadMyReportElements()}>Reports</Link>
```

## Next.js

The components only load in the browser, so they're safe to render on the server. In the App Router, use them inside a client component:

```tsx
'use client';
import { MyReportViewer } from 'react-my-report';

export default function ReportPage() {
  return <MyReportViewer path="/reports/sales.report.json" style={{ height: '100vh' }} />;
}
```

## Data

`datasource` replaces the data source saved in the report. Leave it empty to use the report's own.

- **URL with `type="json"`**: fetched as JSON. The array path saved in the report (for example `data.items`) still applies. If that path isn't in the response, the array is found automatically.
- **URL with `type="odata"`**: an OData v2/v4 service root or entity-set URL. The report's entity set, `$select`, `$filter`, `$orderby`, `$expand` and `$top` still apply, and `nextLink` paging is followed.
- **JSON string, array or object**: used as the data directly.

Request headers (for example `Authorization`) come from the report's data source settings.

## Parameters

Pass values as an object (`{ Country: 'Egypt' }`), a JSON string, or a query string (`Country=Egypt&Year=2024`). They fill the report's parameters, are available as `@Country` in expressions and as `{@Country}` in data source URLs, and can be changed in the viewer's parameter bar.

## TypeScript

Types are included: `MyReportDesignerProps`, `MyReportViewerProps`, `MyReportDefinition` and `MyReportDataType`.

## Other frameworks

- **Angular**: [`angular-my-report`](https://www.npmjs.com/package/angular-my-report)
- **Vue, Svelte, plain HTML or anything else** (Web Components): [`elements-my-report`](https://www.npmjs.com/package/elements-my-report)

## License

MIT
