import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import { contentWidth } from '../../model/defaults';
import { DesignerStore } from '../designer.store';
import { DRAG_MIME, elementFromPayload, type DragPayload } from './canvas.component';

const TOOLS: { kind: 'text' | 'line' | 'rect' | 'image'; label: string; icon: string }[] = [
  { kind: 'text', label: 'Label', icon: 'A' },
  { kind: 'line', label: 'Line', icon: '―' },
  { kind: 'rect', label: 'Rectangle', icon: '▭' },
  { kind: 'image', label: 'Image', icon: '🖼' },
];

type DataToolKind = 'table' | 'chart' | 'crosstab' | 'barcode' | 'qrcode';
const DATA_TOOLS: { kind: DataToolKind; label: string; icon: string; hint: string }[] = [
  { kind: 'chart', label: 'Chart', icon: '📊', hint: 'Bar, line, area, pie or doughnut chart over the rows of its band' },
  { kind: 'crosstab', label: 'Cross table', icon: '⊞', hint: 'Pivot: rows × columns of a value, with totals' },
  { kind: 'barcode', label: 'Barcode', icon: '║', hint: 'Code 128 or EAN-13; value can be a field like {OrderID}' },
  { kind: 'qrcode', label: 'QR code', icon: '▣', hint: 'QR code; value can contain fields' },
];

const SPECIALS: { label: string; template: string }[] = [
  { label: 'Page N of M', template: 'Page {PageNumber} of {TotalPages}' },
  { label: 'Page number', template: '{PageNumber}' },
  { label: 'Current date/time', template: '{Now}' },
  { label: 'Row number', template: '{RowNumber}' },
  { label: 'Report name', template: '{ReportName}' },
  { label: 'Record count', template: '{count()}' },
];

const TYPE_ICON: Record<string, string> = { number: '#', string: 'Ab', date: '📅', boolean: '✓', object: '{}' };

@Component({
  selector: 'rpt-left-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aside class="panel left-panel">
      <section>
        <h3>Toolbox</h3>
        <div class="toolbox">
          <div
            class="tool"
            draggable="true"
            title="Self-contained table: lists the rows of its band (all rows in Report Header/Footer, group rows in group bands)"
            (dragstart)="dragStart($event, dataPayload('table'))"
            (click)="add(dataPayload('table'))"
          >
            <span class="tool-icon">▦</span>Table
          </div>
          <div class="tool" title="Column titles in the header band, one field per column in Detail" (click)="openBandedTable.emit()">
            <span class="tool-icon">☰</span>Header/Detail
          </div>
          @for (t of dataTools; track t.kind) {
            <div class="tool" draggable="true" [title]="t.hint" (dragstart)="dragStart($event, dataPayload(t.kind))" (click)="add(dataPayload(t.kind))">
              <span class="tool-icon">{{ t.icon }}</span>{{ t.label }}
            </div>
          }
          @for (t of tools; track t.kind) {
            <div class="tool" draggable="true" (dragstart)="dragStart($event, { kind: t.kind })" (click)="add({ kind: t.kind })">
              <span class="tool-icon">{{ t.icon }}</span>{{ t.label }}
            </div>
          }
        </div>
      </section>

      <section class="grow">
        <h3>
          Data
          <button class="link" (click)="openDataSource.emit()">Configure…</button>
        </h3>
        <div class="ds-summary">
          {{ ds().type === 'odata' ? 'OData' : 'JSON' }}:
          <span class="muted">{{ dsLabel() }}</span>
          @if (ds().entitySet) {
            <span class="muted"> / {{ ds().entitySet }}</span>
          }
        </div>
        <div class="ds-status {{ data().status }}">
          @switch (data().status) {
            @case ('loading') { Loading… }
            @case ('ready') { {{ data().rows.length }} rows, {{ data().fields.length }} fields }
            @case ('error') { {{ data().error }} }
            @default { No data source configured }
          }
          @if (data().status !== 'idle') {
            <button class="link" (click)="store.reloadData()">Refresh</button>
          }
        </div>
        <div class="field-list">
          @for (f of data().fields; track f.name) {
            <div
              class="field-item"
              draggable="true"
              title="Drag onto a band or table (double-click adds to selected band). Numbers dropped in footers become sum()."
              (dragstart)="dragStart($event, { kind: 'field', field: f.name, type: f.type })"
              (dblclick)="add({ kind: 'field', field: f.name, type: f.type })"
            >
              <span class="field-type">{{ typeIcon[f.type] }}</span>{{ f.name }}
            </div>
          }
        </div>
        @if (data().docFields?.length) {
          <h4>Document fields</h4>
          <div class="field-list">
            @for (f of data().docFields; track f.name) {
              <div
                class="field-item"
                draggable="true"
                title="A value of the whole document (not per row), e.g. a receipt number or shop name"
                (dragstart)="dragStart($event, { kind: 'field', field: f.name, type: f.type })"
                (dblclick)="add({ kind: 'field', field: f.name, type: f.type })"
              >
                <span class="field-type">{{ typeIcon[f.type] }}</span>{{ f.name.slice(5) }}
              </div>
            }
          </div>
        }
        @if (params().length) {
          <h4>Parameters</h4>
          <div class="field-list">
            @for (p of params(); track p.name) {
              <div
                class="field-item special"
                draggable="true"
                (dragstart)="dragStart($event, { kind: 'field', field: '', template: '{@' + p.name + '}' })"
                (dblclick)="add({ kind: 'field', field: '', template: '{@' + p.name + '}' })"
              >
                <span class="field-type">&#64;</span>{{ p.label || p.name }}
              </div>
            }
          </div>
        }
        <h4>Special fields</h4>
        <div class="field-list">
          @for (s of specials; track s.label) {
            <div
              class="field-item special"
              draggable="true"
              (dragstart)="dragStart($event, { kind: 'field', field: '', template: s.template })"
              (dblclick)="add({ kind: 'field', field: '', template: s.template })"
            >
              <span class="field-type">ƒ</span>{{ s.label }}
            </div>
          }
        </div>
      </section>
    </aside>
  `,
})
export class LeftPanelComponent {
  protected readonly store = inject(DesignerStore);
  readonly openDataSource = output<void>();
  readonly openBandedTable = output<void>();
  protected readonly dataTools = DATA_TOOLS;

  protected readonly tools = TOOLS;
  protected readonly specials = SPECIALS;
  protected readonly typeIcon = TYPE_ICON;
  protected readonly data = this.store.data;
  protected readonly params = computed(() => (this.store.report().parameters ?? []).filter((p) => p.name));
  protected readonly ds = computed(() => this.store.report().dataSource);
  protected readonly dsLabel = computed(() => {
    const ds = this.ds();
    return ds.type === 'json' && ds.inline.trim() ? '(pasted JSON)' : ds.url || '(not set)';
  });
  /** Toolbox items that are pre-configured from the current data fields. */
  protected dataPayload(kind: DataToolKind): DragPayload {
    return { kind, fields: this.data().fields.filter((f) => f.type !== 'object') };
  }

  protected dragStart(e: DragEvent, payload: DragPayload): void {
    e.dataTransfer?.setData(DRAG_MIME, JSON.stringify(payload));
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
  }

  /** Click / double-click: add to the selected band (or Detail) at the top-left. */
  protected add(payload: DragPayload): void {
    const report = this.store.report();
    const band =
      report.bands.find((b) => b.id === this.store.selection().bandId) ?? report.bands.find((b) => b.type === 'detail')!;
    const el = elementFromPayload(payload, band, 0, 0, contentWidth(report.page));
    this.store.update((r) => {
      const b = r.bands.find((bb) => bb.id === band.id)!;
      b.elements.push(el);
      b.height = Math.max(b.height, el.h);
    });
    this.store.select({ elementIds: [el.id], bandId: band.id });
  }
}
