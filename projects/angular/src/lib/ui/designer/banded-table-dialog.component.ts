import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { addBandedTable, type BandedTableOptions } from '../../model/factories';
import { DesignerStore } from '../designer.store';

/**
 * Header/Detail table wizard: titles go in a header band, one field per column in Detail.
 * Everything it creates is ordinary labels/fields, editable afterwards.
 */
@Component({
  selector: 'rpt-banded-table-dialog',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="modal-backdrop" (pointerdown)="onBackdropDown($event)">
      <div class="modal">
        <header>
          <h2>Header / Detail table</h2>
          <button class="link" (click)="closed.emit()">✕</button>
        </header>
        <div class="modal-body">
          @if (!fields().length) {
            <p class="error">Load a data source first — the columns are made from its fields.</p>
          } @else {
            <div class="field">
              Columns ({{ selectedCount() }} selected)
              <div class="wizard-fields">
                @for (f of fields(); track f.name) {
                  <label class="check">
                    <input type="checkbox" [ngModel]="picked()[f.name]" (ngModelChange)="toggle(f.name, $event)" />
                    {{ f.name }} <span class="muted">({{ f.type }})</span>
                  </label>
                }
              </div>
              <div class="inline">
                <button class="small" (click)="all(true)">All</button>
                <button class="small" (click)="all(false)">None</button>
              </div>
            </div>
            <div class="grid2">
              <label class="field">
                Column titles in
                <select [(ngModel)]="titleBand">
                  <option value="pageHeader">Page Header (every page)</option>
                  <option value="reportHeader">Report Header (first page)</option>
                  @if (hasGroups()) {
                    <option value="groupHeader">Group Header (every group)</option>
                  }
                </select>
              </label>
              <label class="field">
                Row height
                <input type="number" min="12" [(ngModel)]="rowHeight" />
              </label>
              <label class="field">
                Title background
                <input type="color" [(ngModel)]="headerBackground" />
              </label>
              <label class="field">
                Title text
                <input type="color" [(ngModel)]="headerColor" />
              </label>
            </div>
            <label class="check"><input type="checkbox" [(ngModel)]="grid" /> Grid borders around cells</label>
            <label class="check"><input type="checkbox" [(ngModel)]="totals" /> Totals of number columns in Report Footer</label>
            <label class="check"><input type="checkbox" [(ngModel)]="replace" /> Replace what is in the title band and Detail band now</label>
          }
        </div>
        <footer>
          <button (click)="closed.emit()">Cancel</button>
          <button class="primary" [disabled]="!selectedCount()" (click)="create()">Create table</button>
        </footer>
      </div>
    </div>
  `,
})
export class BandedTableDialogComponent {
  private readonly store = inject(DesignerStore);
  readonly closed = output<void>();

  protected readonly fields = computed(() => this.store.data().fields.filter((f) => f.type !== 'object'));
  protected readonly hasGroups = computed(() => this.store.report().groups.length > 0);
  protected readonly picked = signal<Record<string, boolean>>(
    Object.fromEntries(this.store.data().fields.filter((f) => f.type !== 'object').map((f, i) => [f.name, i < 8])),
  );
  protected readonly selectedCount = computed(() => this.fields().filter((f) => this.picked()[f.name]).length);

  protected titleBand: BandedTableOptions['titleBand'] = 'pageHeader';
  protected rowHeight = 22;
  protected headerBackground = '#1f3a68';
  protected headerColor = '#ffffff';
  protected grid = true;
  protected totals = true;
  protected replace = true;

  protected onBackdropDown(e: PointerEvent): void {
    if (e.target === e.currentTarget) this.closed.emit();
  }

  protected toggle(name: string, on: boolean): void {
    this.picked.update((p) => ({ ...p, [name]: on }));
  }

  protected all(on: boolean): void {
    this.picked.set(Object.fromEntries(this.fields().map((f) => [f.name, on])));
  }

  protected create(): void {
    const opts: BandedTableOptions = {
      fields: this.fields().filter((f) => this.picked()[f.name]),
      titleBand: this.titleBand,
      grid: this.grid,
      headerBackground: this.headerBackground,
      headerColor: this.headerColor,
      totals: this.totals,
      rowHeight: Math.max(12, Number(this.rowHeight) || 22),
      replace: this.replace,
    };
    let ids: string[] = [];
    this.store.update((r) => (ids = addBandedTable(r, opts)));
    const detail = this.store.report().bands.find((b) => b.type === 'detail');
    this.store.select({ elementIds: [], bandId: detail?.id ?? null });
    void ids;
    this.closed.emit();
  }
}
