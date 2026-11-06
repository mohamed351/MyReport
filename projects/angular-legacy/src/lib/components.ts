import { ChangeDetectionStrategy, Component, EventEmitter, Input, NgModule, Output } from '@angular/core';
import { ReportElementBase } from './report-element';
import type { MyReportDataType, MyReportDefinition, MyReportParams, MyReportDataSource } from './types';

const HOST_STYLES = [':host { display: block; position: relative; }'];

/** The MyReport report viewer. Give it a height: it fills its container. */
@Component({
  selector: 'my-report-viewer',
  template: '',
  styles: HOST_STYLES,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyReportViewerComponent extends ReportElementBase {
  protected readonly tag = 'myreport-viewer';
  protected readonly properties = ['path', 'report', 'datasource', 'type', 'params', 'designerUrl', 'allowOpen'] as const;

  /** URL of the .report.json to show. */
  @Input() path?: string | null;
  /** A report definition (object or JSON string). Used when `path` is empty. */
  @Input() report?: MyReportDefinition | string | null;
  /** The report's data: a URL (JSON or OData), a JSON string, or the data itself. Empty = the report's own data source. */
  @Input() datasource?: MyReportDataSource;
  /** How a `datasource` URL is read. Default `json`. */
  @Input() type?: MyReportDataType;
  /** Parameter values: an object, JSON string, or query string (`Country=Egypt&Year=2024`). */
  @Input() params?: MyReportParams | null;
  /** Shows a "Designer" toolbar link to this URL. */
  @Input() designerUrl?: string | null;
  /** Shows the toolbar Open button for local .report.json files. Default `true`. */
  @Input() allowOpen?: boolean;

  /** The report has loaded. */
  @Output() loaded = new EventEmitter<MyReportDefinition>();
  /** The data rows have loaded. */
  @Output() dataLoaded = new EventEmitter<Record<string, unknown>[]>();
  /** The report or its data failed to load. */
  @Output() loadError = new EventEmitter<string>();

  protected outputs() {
    return { loaded: this.loaded, dataLoaded: this.dataLoaded, loadError: this.loadError };
  }
}

/** The MyReport report designer. Give it a height: it fills its container. */
@Component({
  selector: 'my-report-designer',
  template: '',
  styles: HOST_STYLES,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyReportDesignerComponent extends ReportElementBase {
  protected readonly tag = 'myreport-designer';
  protected readonly properties = ['path', 'report', 'datasource', 'type', 'params', 'persistKey', 'viewerUrl', 'download', 'brand'] as const;

  /** URL of a .report.json to open. */
  @Input() path?: string | null;
  /** A report definition (object or JSON string). Used when `path` is empty. */
  @Input() report?: MyReportDefinition | string | null;
  /** Data to design against, replacing the report's data source. */
  @Input() datasource?: MyReportDataSource;
  /** How a `datasource` URL is read. Default `json`. */
  @Input() type?: MyReportDataType;
  /** Parameter values: an object, JSON string, or query string. */
  @Input() params?: MyReportParams | null;
  /** localStorage key to autosave to, and to restore from when nothing else is given. */
  @Input() persistKey?: string | null;
  /** Shows a "Viewer ↗" toolbar link to this URL. */
  @Input() viewerUrl?: string | null;
  /** Whether Save downloads a .report.json. Default `true`. `save` fires either way. */
  @Input() download?: boolean;
  /** Toolbar title. Default `My Report`. */
  @Input() brand?: string | null;

  /** The user clicked Save. */
  @Output() save = new EventEmitter<MyReportDefinition>();
  /** Fires after every edit. */
  @Output() reportChange = new EventEmitter<MyReportDefinition>();
  /** The report has loaded. */
  @Output() loaded = new EventEmitter<MyReportDefinition>();
  /** The report failed to load. */
  @Output() loadError = new EventEmitter<string>();

  protected outputs() {
    return { save: this.save, reportChange: this.reportChange, loaded: this.loaded, loadError: this.loadError };
  }
}

/** Import this module to use `<my-report-viewer>` and `<my-report-designer>`. Works in NgModules and standalone components. */
@NgModule({
  declarations: [MyReportViewerComponent, MyReportDesignerComponent],
  exports: [MyReportViewerComponent, MyReportDesignerComponent],
})
export class MyReportModule {}
