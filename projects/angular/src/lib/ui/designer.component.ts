import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  ViewEncapsulation,
  booleanAttribute,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { DataSourceType, ReportDefinition, ReportElement } from '../model/types';
import { receiptReport } from '../model/factories';
import { newReport, uid } from '../model/defaults';
import { DesignerStore, fetchReport, validateReport } from './designer.store';
import { CanvasComponent } from './designer/canvas.component';
import { LeftPanelComponent } from './designer/left-panel.component';
import { DataSourceDialogComponent } from './designer/data-source-dialog.component';
import { ViewerComponent } from './viewer/viewer.component';
import { BandedTableDialogComponent } from './designer/banded-table-dialog.component';
import { PropertiesPanelComponent } from './properties/properties-panel.component';
import { parseParams, parseReport } from './inputs';

/**
 * The report designer.
 *
 * ```html
 * <myreport-designer path="/reports/sales.report.json" (save)="store($event)" />
 * ```
 */
@Component({
  selector: 'myreport-designer',
  standalone: true,
  imports: [FormsModule, CanvasComponent, LeftPanelComponent, PropertiesPanelComponent, DataSourceDialogComponent, ViewerComponent, BandedTableDialogComponent],
  providers: [DesignerStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  styleUrl: './myreport.css',
  // A class binding (not a static host class) so classes the host page set on the element are kept.
  host: { '[class.myreport]': 'true' },
  template: `
    <div class="app">
      <header class="toolbar">
        <span class="brand">{{ brand() }}</span>
        <select class="new-menu" title="New report from a template" [ngModel]="''" (ngModelChange)="newFrom($event)">
          <option value="" disabled>New ▾</option>
          <option value="blank">Blank report</option>
          <option value="receipt80">Receipt — 80 mm roll</option>
          <option value="receipt58">Receipt — 58 mm roll</option>
        </select>
        <button (click)="fileInput.click()">Open…</button>
        <button (click)="saveReport()">Save</button>
        <input #fileInput type="file" accept=".json,application/json" hidden (change)="open($event)" />
        <span class="sep"></span>
        <button [disabled]="!store.canUndo()" title="Undo (Ctrl+Z)" (click)="store.undo()">↶ Undo</button>
        <button [disabled]="!store.canRedo()" title="Redo (Ctrl+Y)" (click)="store.redo()">↷ Redo</button>
        <span class="sep"></span>
        <button (click)="showData.set(true)">Data source…</button>
        <span class="sep"></span>
        <label class="check">
          <input type="checkbox" [ngModel]="store.snap()" (ngModelChange)="store.snap.set($event)" /> Snap
        </label>
        <select title="Zoom" [ngModel]="store.zoom()" (ngModelChange)="store.zoom.set(+$event)">
          @for (z of zooms; track z) {
            <option [value]="z">{{ z * 100 }}%</option>
          }
        </select>
        <span class="spacer"></span>
        @if (status()) {
          <span class="muted" [class.error]="status()!.error">{{ status()!.text }}</span>
        }
        @if (viewerUrl()) {
          <a class="btn-link" [href]="viewerUrl()" target="_blank" title="Open the report in the full viewer (new tab)">Viewer ↗</a>
        }
        <button class="primary" (click)="showPreview.set(true)">▶ Preview</button>
      </header>
      <main class="workspace">
        <rpt-left-panel (openDataSource)="showData.set(true)" (openBandedTable)="showBanded.set(true)" />
        <rpt-canvas />
        <rpt-properties-panel />
      </main>
    </div>
    @if (showData()) {
      <rpt-data-source-dialog (closed)="showData.set(false)" />
    }
    @if (showBanded()) {
      <rpt-banded-table-dialog (closed)="showBanded.set(false)" />
    }
    @if (showPreview()) {
      <rpt-viewer [embedded]="true" (closed)="showPreview.set(false)" />
    }
  `,
})
export class MyReportDesignerComponent {
  protected readonly store = inject(DesignerStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** URL of a .report.json to open. */
  readonly path = input<string | null | undefined>(null);
  /** A report definition to open (object or JSON string); used when `path` is empty. */
  readonly report = input<ReportDefinition | string | null | undefined>(null);
  /** Replaces the report's data source while designing: a URL, a JSON string, or the data itself. */
  readonly datasource = input<unknown>(null);
  /** How `datasource` is read: `json` (default) or `odata`. */
  readonly type = input<DataSourceType | null | undefined>('json');
  /** Parameter values (object, JSON string or query string `a=1&b=2`). */
  readonly params = input<Record<string, unknown> | string | null | undefined>(null);
  /** localStorage key to autosave the report to (and restore from when no path/report is given). */
  readonly persistKey = input<string | null | undefined>(null);
  /** Shows a "Viewer ↗" link in the toolbar pointing at this URL. */
  readonly viewerUrl = input<string | null | undefined>(null);
  /** Save downloads a .report.json file (default true). The `save` event fires either way. */
  readonly download = input(true, { transform: booleanAttribute });
  /** Toolbar title. */
  readonly brand = input<string | null | undefined>('My Report');

  /** Fires with the report when the user clicks Save. */
  readonly save = output<ReportDefinition>();
  /** Fires with the report after every change. */
  readonly reportChange = output<ReportDefinition>();
  /** Fires with the report after it was loaded from `path`. */
  readonly loaded = output<ReportDefinition>();
  /** Fires with a message when `path` could not be loaded. */
  readonly loadError = output<string>();

  protected readonly status = signal<{ text: string; error?: boolean } | null>(null);
  protected readonly showData = signal(false);
  protected readonly showPreview = signal(false);
  protected readonly showBanded = signal(false);
  protected readonly zooms = [0.5, 0.75, 1, 1.25, 1.5, 2];
  private clipboard: ReportElement[] = [];

  constructor() {
    // Open the report from `path`, else `report`, else the autosaved one, else a blank report.
    effect((onCleanup) => {
      const path = this.path()?.trim();
      const report = this.report();
      const key = this.persistKey()?.trim() || null;
      untracked(() => {
        this.store.persistKey.set(null);
        if (path) {
          const ac = new AbortController();
          onCleanup(() => ac.abort());
          this.status.set({ text: 'Loading report…' });
          fetchReport(path, ac.signal)
            .then((r) => {
              this.store.load(r);
              this.store.persistKey.set(key);
              this.status.set(null);
              this.loaded.emit(r);
            })
            .catch((e) => {
              if (ac.signal.aborted) return;
              const msg = `Could not load ${path}: ${(e as Error).message}`;
              this.status.set({ text: msg, error: true });
              this.loadError.emit(msg);
            });
          return;
        }
        this.status.set(null);
        const def = parseReport(report);
        if (def) {
          this.store.load(def);
          this.store.persistKey.set(key);
        } else if (!(key && this.store.restore(key))) {
          this.store.load(newReport());
          this.store.persistKey.set(key);
        }
      });
    });

    effect(() => this.store.dataOverride.set(this.datasource() == null || this.datasource() === '' ? null : { source: this.datasource(), type: this.type() === 'odata' ? 'odata' : 'json' }));
    effect(() => this.store.externalParams.set(parseParams(this.params())));

    // Report changes → (reportChange)
    let first = true;
    effect(() => {
      const r = this.store.report();
      if (first) {
        first = false;
        return;
      }
      untracked(() => this.reportChange.emit(r));
    });
  }

  /** Starts a new report from a template (the select resets itself to "New ▾"). */
  protected newFrom(kind: string): void {
    const make: Record<string, () => ReportDefinition> = {
      blank: newReport,
      receipt80: () => receiptReport(80),
      receipt58: () => receiptReport(58),
    };
    if (make[kind] && confirm('Start a new report? Unsaved changes to the current one are lost (Save first if needed).')) {
      this.store.load(make[kind]());
    }
  }

  protected saveReport(): void {
    const r = this.store.report();
    this.save.emit(r);
    if (!this.download()) return;
    const blob = new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${r.name.replace(/[^\w\- ]+/g, '').trim() || 'report'}.report.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  protected async open(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      this.store.load(validateReport(JSON.parse(await file.text())));
    } catch (err) {
      alert('Could not open file: ' + (err as Error).message);
    }
  }

  /** Keys belong to the designer only when focus is inside it (or nowhere in particular). */
  private ownsKey(e: KeyboardEvent): boolean {
    const t = e.target as HTMLElement | null;
    return !t || t === document.body || t === document.documentElement || this.host.nativeElement.contains(t);
  }

  @HostListener('window:keydown', ['$event'])
  protected onKey(e: KeyboardEvent): void {
    const target = e.target as HTMLElement;
    if (!this.ownsKey(e)) return;
    if (this.showData() || this.showPreview() || this.showBanded() || target.closest?.('input, textarea, select, [contenteditable]')) return;
    const store = this.store;
    const sel = store.selection();
    const report = store.report();
    const ids = sel.elementIds;
    const ctrl = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();

    if (ctrl && key === 'z' && !e.shiftKey) {
      e.preventDefault();
      store.undo();
      return;
    }
    if (ctrl && (key === 'y' || (key === 'z' && e.shiftKey))) {
      e.preventDefault();
      store.redo();
      return;
    }
    if (ctrl && key === 'a' && sel.bandId) {
      e.preventDefault();
      const band = report.bands.find((b) => b.id === sel.bandId);
      if (band) store.select({ elementIds: band.elements.map((x) => x.id), bandId: band.id });
      return;
    }
    if (!ids.length && !(ctrl && key === 'v')) return;

    const selectedEls = () => report.bands.flatMap((b) => b.elements.filter((x) => ids.includes(x.id)));

    if (key === 'delete' || key === 'backspace') {
      e.preventDefault();
      store.update((r) => r.bands.forEach((b) => (b.elements = b.elements.filter((x) => !ids.includes(x.id)))));
    } else if (ctrl && key === 'c') {
      this.clipboard = structuredClone(selectedEls());
    } else if (ctrl && (key === 'v' || key === 'd')) {
      e.preventDefault();
      const source = key === 'd' ? selectedEls() : this.clipboard;
      if (!source.length) return;
      const bandId = sel.bandId ?? report.bands.find((b) => b.type === 'detail')?.id ?? report.bands[0].id;
      const copies = source.map((x) => ({ ...structuredClone(x), id: uid('el'), x: x.x + 8, y: x.y + 8 }));
      store.update((r) => r.bands.find((b) => b.id === bandId)!.elements.push(...copies));
      store.select({ elementIds: copies.map((c) => c.id), bandId });
    } else if (key.startsWith('arrow')) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : store.snap() ? 8 : 1;
      const dx = key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0;
      const dy = key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0;
      store.update((r) =>
        r.bands.forEach((b) =>
          b.elements.forEach((x) => {
            if (!ids.includes(x.id)) return;
            x.x = Math.max(0, x.x + dx);
            x.y = Math.max(0, x.y + dy);
          }),
        ),
      );
    } else if (key === 'escape') {
      store.select({ elementIds: [], bandId: sel.bandId });
    }
  }
}
