import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import type { PageBackground, PageSettings, Watermark } from '../../model/types';
import { contentWidth } from '../../model/defaults';
import { ElementBoxComponent } from '../designer/element-box.component';
import { SafeImagePipe } from '../designer/safe-image.pipe';
import type { ViewPage } from './render';

const FIT = { cover: 'cover', contain: 'contain', stretch: 'fill', center: 'none' } as const;

/** One printed page: background, watermark, bands and their elements. */
@Component({
  selector: 'rpt-page-view',
  standalone: true,
  imports: [NgTemplateOutlet, ElementBoxComponent, SafeImagePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let p = settings();
    <div class="rpt-page" [class.roll]="p.continuous" [style.width.px]="p.width" [style.height.px]="page().height">
      @if (page().background) {
        <img class="rpt-bg" alt="" [src]="background().image | safeImage" [style.object-fit]="fit()" />
      }
      @if (page().watermark && watermark().layer === 'behind') {
        <ng-container *ngTemplateOutlet="wm" />
      }
      @for (b of page().bands; track $index) {
        <div style="position: absolute" [style.left.px]="p.marginLeft" [style.top.px]="b.top" [style.width.px]="contentWidth()" [style.height.px]="b.height">
          @for (it of b.items; track it.key) {
            <rpt-element
              [el]="it.el"
              [top]="it.top"
              [height]="it.height"
              [content]="it.content"
              [tableData]="it.tableData"
              [rows]="it.rows"
              [attr.data-key]="it.key"
              [class.find-hit]="highlights().has(it.key)"
              [class.find-active]="active() === it.key"
            />
          }
        </div>
      }
      @if (page().watermark && watermark().layer === 'front') {
        <ng-container *ngTemplateOutlet="wm" />
      }
    </div>

    <ng-template #wm>
      @let w = watermark();
      <div class="rpt-watermark" [style.opacity]="w.opacity">
        @if (w.kind === 'image') {
          <img alt="" [src]="w.image | safeImage" [style.width.%]="w.imageScale" [style.transform]="'rotate(' + w.angle + 'deg)'" />
        } @else {
          <span [style.font-size.px]="w.fontSize" [style.color]="w.color" [style.font-weight]="w.bold ? 700 : 400" [style.transform]="'rotate(' + w.angle + 'deg)'">{{
            watermarkText()
          }}</span>
        }
      </div>
    </ng-template>
  `,
})
export class PageViewComponent {
  readonly page = input.required<ViewPage>();
  readonly settings = input.required<PageSettings>();
  readonly watermark = input.required<Watermark>();
  readonly background = input.required<PageBackground>();
  readonly watermarkText = input('');
  readonly highlights = input<ReadonlySet<string>>(new Set());
  readonly active = input<string | null>(null);

  protected readonly contentWidth = computed(() => contentWidth(this.settings()));
  protected readonly fit = computed(() => FIT[this.background().fit]);
}
