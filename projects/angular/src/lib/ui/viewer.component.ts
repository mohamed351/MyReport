import { ChangeDetectionStrategy, Component, ViewEncapsulation, booleanAttribute, effect, inject, input, output, signal, untracked } from '@angular/core';
import type { DataSourceType, ReportDefinition } from '../model/types';
import { newReport } from '../model/defaults';
import { DesignerStore, fetchReport, type DataState } from './designer.store';
import { ViewerComponent } from './viewer/viewer.component';
import { parseParams, parseReport } from './inputs';

/**
 * The report viewer.
 *
 * ```html
 * <myreport-viewer path="/reports/sales.report.json" datasource="/api/orders" type="json" />
 * <myreport-viewer path="/reports/orders.report.json" datasource="https://host/odata/Orders" type="odata" />
 * ```
 */
@Component({
  selector: 'myreport-viewer',
  standalone: true,
  imports: [ViewerComponent],
  providers: [DesignerStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  styleUrl: './myreport.css',
  // A class binding (not a static host class) so classes the host page set on the element are kept.
  host: { '[class.myreport]': 'true' },
  template: `
    @if (error()) {
      <div class="viewer-msg error">{{ error() }}</div>
    }
    <rpt-viewer [designerUrl]="designerUrl()" [allowOpen]="allowOpen()" />
  `,
})
export class MyReportViewerComponent {
  private readonly store = inject(DesignerStore);

  /** URL of the .report.json to show. */
  readonly path = input<string | null | undefined>(null);
  /** A report definition (object or JSON string); used when `path` is empty. */
  readonly report = input<ReportDefinition | string | null | undefined>(null);
  /**
   * The report's data, replacing its own data source: a URL (JSON file/API, or OData service / entity-set URL),
   * a JSON string, or (as a property) an array/object. Empty = use the report's data source.
   */
  readonly datasource = input<unknown>(null);
  /** How `datasource` is read: `json` (default) or `odata`. */
  readonly type = input<DataSourceType | null | undefined>('json');
  /** Parameter values: object, JSON string, or query string (`Country=Egypt&Year=2024`). */
  readonly params = input<Record<string, unknown> | string | null | undefined>(null);
  /** Shows a "Designer" link in the toolbar pointing at this URL. */
  readonly designerUrl = input<string | null | undefined>(null);
  /** Shows the toolbar's Open button for local .report.json files (default true). */
  readonly allowOpen = input(true, { transform: booleanAttribute });

  /** Fires with the report once it is loaded. */
  readonly loaded = output<ReportDefinition>();
  /** Fires with a message when the report or its data could not be loaded. */
  readonly loadError = output<string>();
  /** Fires with the rows once the data is loaded. */
  readonly dataLoaded = output<DataState['rows']>();

  protected readonly error = signal<string | null>(null);

  constructor() {
    effect((onCleanup) => {
      const path = this.path()?.trim();
      const report = this.report();
      untracked(() => {
        this.error.set(null);
        if (path) {
          const ac = new AbortController();
          onCleanup(() => ac.abort());
          fetchReport(path, ac.signal)
            .then((r) => {
              this.store.load(r);
              this.loaded.emit(r);
            })
            .catch((e) => {
              if (ac.signal.aborted) return;
              const msg = `Could not load ${path}: ${(e as Error).message}`;
              this.error.set(msg);
              this.loadError.emit(msg);
            });
          return;
        }
        const def = parseReport(report) ?? newReport();
        this.store.load(def);
        if (report) this.loaded.emit(def);
      });
    });

    effect(() => {
      const src = this.datasource();
      const type = this.type() === 'odata' ? 'odata' : 'json';
      this.store.dataOverride.set(src == null || src === '' ? null : { source: src, type });
    });
    effect(() => this.store.externalParams.set(parseParams(this.params())));

    // Data status → (dataLoaded) / (loadError)
    effect(() => {
      const d = this.store.data();
      untracked(() => {
        if (d.status === 'ready') this.dataLoaded.emit(d.rows);
        else if (d.status === 'error' && d.error) this.loadError.emit(d.error);
      });
    });
  }
}
