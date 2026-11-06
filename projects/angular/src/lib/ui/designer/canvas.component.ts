import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import type { Band, ReportElement } from '../../model/types';
import { BAND_LABELS, FOOTER_TYPES, contentWidth, createElement, createTable, orderedBands } from '../../model/defaults';
import { createColumn } from '../../engine/table';
import { createBarcode, createChart, createCrosstab, createQr, type FieldRef } from '../../model/factories';
import { DesignerStore } from '../designer.store';
import { ElementBoxComponent } from './element-box.component';

export const DRAG_MIME = 'application/x-report-item';
export type DragPayload =
  | { kind: 'text' | 'line' | 'rect' | 'image' }
  | { kind: 'table' | 'chart' | 'barcode' | 'qrcode' | 'crosstab'; fields: FieldRef[] }
  | { kind: 'field'; field: string; type?: string; template?: string };

const BAND_TITLE_H = 20;
type DragMode = 'move' | 'e' | 's' | 'se';

/** Builds the element a toolbox/field drop creates, adjusted for the target band. */
export function elementFromPayload(p: DragPayload, band: Band, x: number, y: number, width: number): ReportElement {
  if (p.kind === 'table') return createTable(x, y, Math.max(120, width - x), p.fields);
  if (p.kind === 'chart') return createChart(x, y, Math.max(160, width - x), p.fields);
  if (p.kind === 'crosstab') return createCrosstab(x, y, Math.max(200, width - x), p.fields);
  if (p.kind === 'barcode') return createBarcode(x, y, p.fields);
  if (p.kind === 'qrcode') return createQr(x, y, p.fields);
  if (p.kind !== 'field') return createElement(p.kind, x, y);
  if (p.template) return createElement('field', x, y, { text: p.template });
  const numeric = p.type === 'number';
  const inFooter = FOOTER_TYPES.includes(band.type);
  return createElement('field', x, y, {
    text: numeric && inFooter ? `{sum(${p.field})}` : `{${p.field}}`,
    format: p.type === 'date' ? { kind: 'date' } : numeric && inFooter ? { kind: 'number', decimals: 2 } : {},
    style: numeric ? { align: 'right' } : {},
  });
}

@Component({
  selector: 'rpt-canvas',
  standalone: true,
  imports: [ElementBoxComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="canvas-scroll" (pointerdown)="onBackgroundDown($event)">
      <div class="canvas-sizer" [style.width.px]="width() * store.zoom() + 2" [style.height.px]="totalHeight() * store.zoom() + 2">
        <div class="canvas" [style.width.px]="width()" [style.transform]="'scale(' + store.zoom() + ')'">
          @for (band of bands(); track band.id) {
            <div class="band">
              <div
                class="band-title band-{{ band.type }}"
                [class.selected]="isBandSelected(band)"
                [style.height.px]="titleHeight"
                (pointerdown)="store.select({ elementIds: [], bandId: band.id })"
              >
                {{ labels[band.type] }}
                @if (groupField(band); as g) {
                  <span class="band-group">: {{ g }}</span>
                }
              </div>
              <div
                class="band-body"
                [attr.data-band-id]="band.id"
                [style.height.px]="band.height"
                [style.width.px]="width()"
                (dragover)="onDragOver($event)"
                (drop)="onDrop($event, band)"
                (pointerdown)="onBodyDown($event, band)"
              >
                @for (el of band.elements; track el.id) {
                  <rpt-element
                    [el]="el"
                    [content]="el.text"
                    [design]="true"
                    class="design-el kind-{{ el.kind }}"
                    [class.selected]="isSelected(el)"
                    [attr.title]="el.text || null"
                    (pointerdown)="onElementDown($event, el, band)"
                  >
                    @if (isSelected(el) && store.selection().elementIds.length === 1) {
                      <div class="handle handle-e" (pointerdown)="onHandleDown($event, el, band, 'e')"></div>
                      @if (el.kind !== 'table') {
                        <div class="handle handle-s" (pointerdown)="onHandleDown($event, el, band, 's')"></div>
                        <div class="handle handle-se" (pointerdown)="onHandleDown($event, el, band, 'se')"></div>
                      }
                    }
                  </rpt-element>
                }
              </div>
              <div class="band-resizer" title="Drag to resize band" (pointerdown)="startBandResize($event, band)"></div>
            </div>
          }
        </div>
      </div>
    </div>
  `,
})
export class CanvasComponent {
  protected readonly store = inject(DesignerStore);
  protected readonly labels = BAND_LABELS;
  protected readonly titleHeight = BAND_TITLE_H;

  protected readonly width = computed(() => contentWidth(this.store.report().page));
  protected readonly bands = computed(() => orderedBands(this.store.report()).filter((b) => b.visible));
  protected readonly totalHeight = computed(() => this.bands().reduce((h, b) => h + b.height + BAND_TITLE_H + 6, 0));

  protected isSelected(el: ReportElement): boolean {
    return this.store.selection().elementIds.includes(el.id);
  }

  protected isBandSelected(band: Band): boolean {
    const s = this.store.selection();
    return s.bandId === band.id && s.elementIds.length === 0;
  }

  protected groupField(band: Band): string | null {
    if (!band.groupId) return null;
    const g = this.store.report().groups.find((x) => x.id === band.groupId);
    return g ? g.field || '(no field)' : null;
  }

  protected onBackgroundDown(e: PointerEvent): void {
    if (e.target === e.currentTarget) this.store.select({ elementIds: [], bandId: null });
  }

  protected onBodyDown(e: PointerEvent, band: Band): void {
    if (e.target === e.currentTarget) this.store.select({ elementIds: [], bandId: band.id });
  }

  protected onDragOver(e: DragEvent): void {
    if (e.dataTransfer?.types.includes(DRAG_MIME)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  }

  protected onDrop(e: DragEvent, band: Band): void {
    const raw = e.dataTransfer?.getData(DRAG_MIME);
    if (!raw) return;
    e.preventDefault();
    const store = this.store;
    const zoom = store.zoom();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const px = (e.clientX - rect.left) / zoom;
    const py = (e.clientY - rect.top) / zoom;
    const payload: DragPayload = JSON.parse(raw);

    // A field dropped onto a table adds a column to it.
    const target = band.elements.find((t) => t.kind === 'table' && px >= t.x && px <= t.x + t.w && py >= t.y && py <= t.y + t.h);
    if (target && payload.kind === 'field') {
      store.update((r) => {
        const t = r.bands.find((b) => b.id === band.id)!.elements.find((x) => x.id === target.id)!.table!;
        const col = createColumn(payload.field, payload.type);
        if (payload.template) Object.assign(col, { header: '', text: payload.template });
        if (payload.type === 'number') col.footer = `{sum(${payload.field})}`;
        t.columns.push(col);
      });
      store.select({ elementIds: [target.id], bandId: band.id });
      return;
    }

    const width = this.width();
    const el = elementFromPayload(payload, band, store.snapValue(px), store.snapValue(py), width);
    el.x = Math.max(0, Math.min(el.x, width - el.w));
    el.y = Math.max(0, Math.min(el.y, Math.max(0, band.height - el.h)));
    store.update((r) => {
      const b = r.bands.find((bb) => bb.id === band.id)!;
      b.elements.push(el);
      if (b.height < el.y + el.h) b.height = el.y + el.h;
    });
    store.select({ elementIds: [el.id], bandId: band.id });
  }

  protected startBandResize(e: PointerEvent, band: Band): void {
    e.preventDefault();
    e.stopPropagation();
    const store = this.store;
    const zoom = store.zoom();
    const startY = e.clientY;
    const startH = band.height;
    store.checkpoint();
    const move = (ev: PointerEvent) => {
      const h = Math.max(0, store.snapValue(startH + (ev.clientY - startY) / zoom));
      store.update((r) => {
        r.bands.find((b) => b.id === band.id)!.height = h;
      }, false);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  protected onElementDown(e: PointerEvent, el: ReportElement, band: Band): void {
    if (e.button !== 0) return;
    e.stopPropagation();
    const selected = this.isSelected(el);
    let ids = this.store.selection().elementIds;
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      ids = selected ? ids.filter((i) => i !== el.id) : [...ids, el.id];
      this.store.select({ elementIds: ids, bandId: band.id });
      return;
    }
    if (!selected) {
      ids = [el.id];
      this.store.select({ elementIds: ids, bandId: band.id });
    }
    this.beginDrag(e, el, band, ids, 'move');
  }

  protected onHandleDown(e: PointerEvent, el: ReportElement, band: Band, mode: DragMode): void {
    e.stopPropagation();
    this.beginDrag(e, el, band, [el.id], mode);
  }

  private beginDrag(e: PointerEvent, el: ReportElement, band: Band, ids: string[], mode: DragMode): void {
    const store = this.store;
    const zoom = store.zoom();
    const width = this.width();
    const startX = e.clientX;
    const startY = e.clientY;
    const targets = band.elements.filter((x) => (mode === 'move' ? ids.includes(x.id) : x.id === el.id)).map((x) => ({ ...x }));
    const sourceBody = (e.currentTarget as HTMLElement).closest('.band-body') as HTMLElement;
    let moved = false;

    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / zoom;
      const dy = (ev.clientY - startY) / zoom;
      if (!moved) {
        if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
        moved = true;
        store.checkpoint();
      }
      store.update((r) => {
        const b = r.bands.find((bb) => bb.id === band.id)!;
        for (const s of targets) {
          const t = b.elements.find((x) => x.id === s.id);
          if (!t) continue;
          if (mode === 'move') {
            t.x = Math.max(0, Math.min(store.snapValue(s.x + dx), width - t.w));
            t.y = store.snapValue(s.y + dy);
          } else {
            if (mode !== 's') t.w = Math.max(4, Math.min(store.snapValue(s.w + dx), width - t.x));
            if (mode !== 'e') t.h = Math.max(2, store.snapValue(s.h + dy));
          }
        }
      }, false);
    };

    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (!moved || mode !== 'move') return;
      // Dropped over another band? Move the elements there, keeping their on-screen position.
      const targetBody = document.elementsFromPoint(ev.clientX, ev.clientY).find((n) => n.classList.contains('band-body')) as
        | HTMLElement
        | undefined;
      const targetId = targetBody?.dataset['bandId'];
      const srcTop = sourceBody.getBoundingClientRect().top;
      store.update((r) => {
        const src = r.bands.find((b) => b.id === band.id)!;
        const dst = targetId && targetId !== band.id ? r.bands.find((b) => b.id === targetId) : undefined;
        for (const s of targets) {
          const i = src.elements.findIndex((x) => x.id === s.id);
          if (i < 0) continue;
          const t = src.elements[i];
          if (dst && targetBody) {
            const dstTop = targetBody.getBoundingClientRect().top;
            src.elements.splice(i, 1);
            t.y = Math.max(0, Math.min(store.snapValue((srcTop + t.y * zoom - dstTop) / zoom), Math.max(0, dst.height - t.h)));
            dst.elements.push(t);
          } else {
            t.y = Math.max(0, Math.min(t.y, Math.max(0, src.height - t.h)));
          }
        }
      }, false);
      if (targetId && targetId !== band.id) store.select({ elementIds: targets.map((t) => t.id), bandId: targetId });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }
}
