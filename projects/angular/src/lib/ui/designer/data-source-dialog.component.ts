import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { DataSourceDef } from '../../model/types';
import { buildODataUrl, detectDataSource, loadData, loadODataEntitySets, type LoadResult } from '../../engine/dataSources';
import { DesignerStore } from '../designer.store';

@Component({
  selector: 'rpt-data-source-dialog',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="modal-backdrop" (pointerdown)="onBackdropDown($event)">
      <div class="modal">
        <header>
          <h2>Data source</h2>
          <button class="link" (click)="closed.emit()">✕</button>
        </header>
        <div class="modal-body">
          <label class="field">
            URL — paste a JSON API, OData service or OData entity-set URL to configure everything automatically
            <div class="inline">
              <input
                [(ngModel)]="ds.url"
                (paste)="onPaste($event)"
                (keydown.enter)="detect()"
                placeholder="https://jsonplaceholder.typicode.com/posts  ·  https://services.odata.org/V4/Northwind/Northwind.svc/Orders"
              />
              <button [disabled]="detecting() || !ds.url.trim()" (click)="detect()">{{ detecting() ? 'Detecting…' : 'Detect' }}</button>
            </div>
            @if (detectMsg(); as m) {
              <span [class.ok]="!m.error" [class.error]="m.error">{{ m.text }}</span>
            }
          </label>

          <div class="tabs">
            <span class="muted tabs-label">Type:</span>
            <button [class.on]="ds.type === 'json'" (click)="ds.type = 'json'">JSON</button>
            <button [class.on]="ds.type === 'odata'" (click)="ds.type = 'odata'">OData</button>
          </div>

          @if (ds.type === 'json') {
            <label class="field">
              Or paste JSON (used instead of the URL when filled)
              <textarea rows="6" [(ngModel)]="ds.inline" placeholder='[{"Name":"A","Amount":10}]'></textarea>
            </label>
            <label class="field">
              Array path (optional)
              <input [(ngModel)]="ds.dataPath" placeholder="e.g. data.items — blank = auto-detect" />
            </label>
          } @else {
            <label class="field">
              Entity set (leave empty if the URL already points to one)
              <div class="inline">
                <input list="entity-sets" [(ngModel)]="ds.entitySet" placeholder="e.g. Orders" />
                <button [disabled]="!ds.url.trim()" (click)="fetchSets()">Load entity sets</button>
              </div>
              @if (setsMsg()) {
                <span class="muted">{{ setsMsg() }}</span>
              }
              <datalist id="entity-sets">
                @for (s of sets(); track s) {
                  <option [value]="s"></option>
                }
              </datalist>
            </label>
            <div class="grid2">
              <label class="field">$select <input [(ngModel)]="ds.select" placeholder="OrderID,ShipCountry,Freight" /></label>
              <label class="field">$filter <input [(ngModel)]="ds.filter" placeholder="Freight gt 50" /></label>
              <label class="field">$orderby <input [(ngModel)]="ds.orderby" placeholder="OrderDate desc" /></label>
              <label class="field">$expand <input [(ngModel)]="ds.expand" placeholder="Customer" /></label>
              <label class="field">$top <input type="number" min="1" [(ngModel)]="ds.top" /></label>
              <label class="field">Max rows (paging cap) <input type="number" min="1" [(ngModel)]="ds.maxRows" /></label>
            </div>
            <div class="muted url-preview">{{ odataUrl() }}</div>
          }

          <label class="field">
            Request headers (one per line)
            <textarea rows="2" [(ngModel)]="ds.headers" placeholder="Authorization: Bearer …"></textarea>
          </label>

          <div class="test-area">
            <button [disabled]="busy()" (click)="runTest()">{{ busy() ? 'Testing…' : 'Test connection' }}</button>
            @if (error()) {
              <div class="error">{{ error() }}</div>
            }
            @if (result(); as res) {
              <div class="ok">{{ res.rows.length }} rows · fields: {{ fieldSummary(res) }}</div>
              @if (res.warning) {
                <div class="error">{{ res.warning }}</div>
              }
            }
          </div>
          <p class="hint">The browser fetches the data directly, so the API must allow CORS from this page.</p>
        </div>
        <footer>
          <button (click)="closed.emit()">Cancel</button>
          <button class="primary" (click)="apply()">Apply</button>
        </footer>
      </div>
    </div>
  `,
})
export class DataSourceDialogComponent {
  private readonly store = inject(DesignerStore);
  readonly closed = output<void>();

  /** Working copy, edited with two-way binding and applied on "Apply". */
  protected ds: DataSourceDef = structuredClone(this.store.report().dataSource);
  protected readonly busy = signal(false);
  protected readonly result = signal<LoadResult | null>(null);
  protected readonly error = signal('');
  protected readonly sets = signal<string[]>([]);
  protected readonly setsMsg = signal('');

  private readonly cdr = inject(ChangeDetectorRef);

  /**
   * Closes when clicking outside the dialog. Must return nothing: an Angular event handler that
   * returns `false` calls preventDefault(), which would stop clicks from focusing the inputs.
   */
  protected onBackdropDown(e: PointerEvent): void {
    if (e.target === e.currentTarget) this.closed.emit();
  }
  protected readonly detecting = signal(false);
  protected readonly detectMsg = signal<{ text: string; error: boolean } | null>(null);

  /** Pasting a URL into the URL field configures the source straight away. */
  protected onPaste(e: ClipboardEvent): void {
    const text = e.clipboardData?.getData('text').trim() ?? '';
    if (!/^(https?:\/\/|\/)\S+$/i.test(text)) return;
    e.preventDefault();
    this.ds = { ...this.ds, url: text };
    this.detect();
  }

  /** Fetches the URL, decides JSON vs OData, fills in the whole form and tests it. */
  protected async detect(): Promise<void> {
    const url = this.ds.url.trim();
    if (!url || this.detecting()) return;
    this.detecting.set(true);
    this.detectMsg.set(null);
    this.result.set(null);
    this.error.set('');
    try {
      const { dataSource, note } = await detectDataSource(url, this.ds.headers);
      this.ds = dataSource;
      this.cdr.markForCheck();
      this.detectMsg.set({ text: note, error: false });
      if (dataSource.type === 'odata' && dataSource.entitySet) this.fetchSets();
      await this.runTest();
    } catch (e) {
      this.detectMsg.set({ text: String((e as Error).message ?? e), error: true });
    } finally {
      this.detecting.set(false);
    }
  }

  protected odataUrl(): string {
    return buildODataUrl(this.normalized());
  }

  protected fieldSummary(res: LoadResult): string {
    return res.fields.map((f) => `${f.name} (${f.type})`).join(', ');
  }

  private normalized(): DataSourceDef {
    return { ...this.ds, top: this.ds.top ? Number(this.ds.top) : null, maxRows: Number(this.ds.maxRows) || 5000 };
  }

  protected async runTest(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    this.result.set(null);
    try {
      this.result.set(await loadData(this.normalized()));
    } catch (e) {
      this.error.set(String((e as Error).message ?? e));
    } finally {
      this.busy.set(false);
    }
  }

  protected async fetchSets(): Promise<void> {
    this.setsMsg.set('Loading…');
    try {
      const list = await loadODataEntitySets(this.ds.url, this.ds.headers);
      this.sets.set(list);
      this.setsMsg.set(list.length ? '' : 'No entity sets found');
    } catch (e) {
      this.setsMsg.set(String((e as Error).message ?? e));
    }
  }

  protected apply(): void {
    const ds = this.normalized();
    this.store.update((r) => (r.dataSource = ds));
    this.closed.emit();
  }
}
