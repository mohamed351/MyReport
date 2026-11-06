import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgTemplateOutlet } from '@angular/common';
import type { ReportParameter } from '../../model/types';
import { defaultBackground, defaultWatermark } from '../../model/defaults';
import { filterRows, paramChoices } from '../../engine/parameters';
import { DesignerStore } from '../designer.store';
import { buildDocument, type Bookmark } from './render';
import { PageViewComponent } from './page-view.component';

type ViewMode = 'continuous' | 'single' | 'two';
type ZoomMode = 'width' | 'page' | number;
const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3];

/**
 * Report viewer: paged view with navigation, zoom, view modes, find, bookmarks, thumbnails,
 * parameters, print and export. Used standalone (/viewer) and as the designer's preview.
 */
@Component({
  selector: 'rpt-viewer',
  standalone: true,
  imports: [FormsModule, NgTemplateOutlet, PageViewComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="viewer" [class.embedded]="embedded()" #root>
      <!-- Toolbar -->
      <div class="viewer-toolbar">
        <button class="vt" [class.on]="sidebar()" title="Bookmarks & pages" (click)="sidebar.set(!sidebar())">☰</button>
        <button class="vt" title="Reload data" (click)="store.reloadData()">⟳</button>
        <span class="vsep"></span>
        <button class="vt" title="Print (Ctrl+P)" (click)="print()">🖨 Print</button>
        <select class="vt-select" title="Save / export" [ngModel]="''" (ngModelChange)="save($event)">
          <option value="" disabled>💾 Save as…</option>
          <option value="pdf">PDF (print dialog → Save as PDF)</option>
          <option value="html">HTML document</option>
          <option value="csv">Data — CSV (Excel)</option>
          <option value="json">Report file (.report.json)</option>
        </select>
        <span class="vsep"></span>
        <button class="vt" title="First page (Home)" [disabled]="current() === 0" (click)="goTo(0)">⏮</button>
        <button class="vt" title="Previous page (PgUp)" [disabled]="current() === 0" (click)="goTo(current() - 1)">◀</button>
        <input class="vt-page" type="number" min="1" [max]="pageCount()" [ngModel]="current() + 1" (change)="goTo(+$any($event.target).value - 1)" />
        <span class="muted">/ {{ pageCount() }}</span>
        <button class="vt" title="Next page (PgDn)" [disabled]="current() >= pageCount() - 1" (click)="goTo(current() + 1)">▶</button>
        <button class="vt" title="Last page (End)" [disabled]="current() >= pageCount() - 1" (click)="goTo(pageCount() - 1)">⏭</button>
        <span class="vsep"></span>
        <button class="vt" title="Zoom out" (click)="zoomStep(-1)">−</button>
        <select class="vt-select" title="Zoom" [ngModel]="zoomKey()" (ngModelChange)="setZoom($event)">
          <option value="width">Page width</option>
          <option value="page">Whole page</option>
          @for (z of zoomSteps; track z) {
            <option [value]="'' + z">{{ z * 100 }}%</option>
          }
          @if (zoomKey() === 'custom') {
            <option value="custom">{{ (zoom() * 100).toFixed(0) }}%</option>
          }
        </select>
        <button class="vt" title="Zoom in" (click)="zoomStep(1)">+</button>
        <select class="vt-select" title="View mode" [ngModel]="mode()" (ngModelChange)="setMode($event)">
          <option value="continuous">Continuous</option>
          <option value="single">Single page</option>
          <option value="two">Two pages</option>
        </select>
        <span class="vsep"></span>
        <button class="vt" [class.on]="findOpen()" title="Find (Ctrl+F)" (click)="toggleFind()">🔍</button>
        @if (parameters().length) {
          <button class="vt" [class.on]="paramsOpen()" title="Parameters" (click)="paramsOpen.set(!paramsOpen())">⚙ Parameters</button>
        }
        <button class="vt" title="Full screen" (click)="fullscreen()">⛶</button>
        <span class="spacer"></span>
        <strong class="viewer-title">{{ store.report().name }}</strong>
        <span class="spacer"></span>
        @if (embedded()) {
          <button class="primary" (click)="closed.emit()">Close</button>
        } @else {
          @if (allowOpen()) {
            <button class="vt" title="Open a .report.json file" (click)="file.click()">📂 Open</button>
            <input #file type="file" accept=".json,application/json" hidden (change)="openFile($event)" />
          }
          @if (designerUrl()) {
            <a class="vt" [href]="designerUrl()" title="Back to the designer">✎ Designer</a>
          }
        }
      </div>

      <!-- Parameters -->
      @if (paramsOpen() && parameters().length) {
        <form class="param-bar" (submit)="$event.preventDefault(); applyParams()">
          @for (p of parameters(); track p.name) {
            <label>
              <span>{{ p.label || p.name }}</span>
              @if (choices(p).length) {
                <select [name]="p.name" [ngModel]="draft()[p.name]" (ngModelChange)="setDraft(p.name, $event)">
                  @for (c of choices(p); track c) {
                    <option [value]="c">{{ c }}</option>
                  }
                </select>
              } @else if (p.type === 'boolean') {
                <input type="checkbox" [name]="p.name" [ngModel]="draft()[p.name] === 'true'" (ngModelChange)="setDraft(p.name, $event ? 'true' : 'false')" />
              } @else {
                <input [type]="p.type === 'number' ? 'number' : p.type === 'date' ? 'date' : 'text'" [name]="p.name" [ngModel]="draft()[p.name]" (ngModelChange)="setDraft(p.name, $event)" />
              }
            </label>
          }
          <button class="primary" type="submit">Apply</button>
        </form>
      }

      <!-- Find -->
      @if (findOpen()) {
        <div class="find-bar">
          <input #findBox placeholder="Find in report…" [ngModel]="query()" (ngModelChange)="setQuery($event)" (keydown.enter)="findStep($any($event).shiftKey ? -1 : 1)" (keydown.escape)="toggleFind()" />
          <button class="vt" title="Previous (Shift+Enter)" [disabled]="!matches().length" (click)="findStep(-1)">▲</button>
          <button class="vt" title="Next (Enter)" [disabled]="!matches().length" (click)="findStep(1)">▼</button>
          <span class="muted">
            @if (query().trim()) {
              {{ matches().length ? matchIndex() + 1 + ' of ' + matches().length : 'No matches' }}
            }
          </span>
          <button class="link" (click)="toggleFind()">✕</button>
        </div>
      }

      <div class="viewer-body">
        <!-- Sidebar -->
        @if (sidebar()) {
          <aside class="viewer-sidebar">
            <div class="tabs">
              <button [class.on]="sideTab() === 'bookmarks'" (click)="sideTab.set('bookmarks')">Bookmarks</button>
              <button [class.on]="sideTab() === 'pages'" (click)="sideTab.set('pages')">Pages</button>
            </div>
            @if (sideTab() === 'bookmarks') {
              @if (doc().bookmarks.length) {
                <ul class="bm-tree">
                  <ng-container *ngTemplateOutlet="bmList; context: { $implicit: doc().bookmarks }" />
                </ul>
              } @else {
                <p class="hint">Bookmarks are made from groups. Add a group to the report to get a clickable outline here.</p>
              }
            } @else {
              <div class="thumbs">
                @for (pg of doc().pages; track pg.index) {
                  <button class="thumb" [class.on]="pg.index === current()" (click)="goTo(pg.index)">
                    <div class="thumb-page" [style.zoom]="thumbScale()">
                      <rpt-page-view [page]="pg" [settings]="settings()" [watermark]="watermark()" [background]="background()" [watermarkText]="doc().watermarkText" />
                    </div>
                    <span>{{ pg.index + 1 }}</span>
                  </button>
                }
              </div>
            }
          </aside>
        }

        <!-- Pages -->
        <div class="viewer-scroll" #scroll (scroll)="onScroll()">
          @if (store.data().status === 'loading') {
            <div class="viewer-msg">Loading data…</div>
          }
          @if (store.data().status === 'error') {
            <div class="viewer-msg error">{{ store.data().error }}</div>
          }
          <div class="viewer-pages mode-{{ mode() }}" [style.zoom]="zoom()">
            @for (pg of shownPages(); track pg.index) {
              <rpt-page-view
                [attr.data-page]="pg.index"
                [page]="pg"
                [settings]="settings()"
                [watermark]="watermark()"
                [background]="background()"
                [watermarkText]="doc().watermarkText"
                [highlights]="highlightSet()"
                [active]="activeKey()"
              />
            }
          </div>
        </div>
      </div>

      <!-- Status bar -->
      <div class="viewer-status">
        <span>Page {{ current() + 1 }} of {{ pageCount() }}</span>
        <span>{{ doc().rowCount }} rows</span>
        <span>{{ (zoom() * 100).toFixed(0) }}%</span>
        @if (store.data().status === 'loading') {
          <span>Loading…</span>
        }
      </div>
    </div>

    <ng-template #bmList let-items>
      @for (b of asBookmarks(items); track $index) {
        <li>
          <button class="bm" (click)="goToBookmark(b)">{{ b.label }} <span class="muted">p{{ b.page + 1 }}</span></button>
          @if (b.children.length) {
            <ul>
              <ng-container *ngTemplateOutlet="bmList; context: { $implicit: b.children }" />
            </ul>
          }
        </li>
      }
    </ng-template>
  `,
})
export class ViewerComponent {
  protected readonly store = inject(DesignerStore);
  /** Inside the designer (shows Close) vs. the standalone /viewer page. */
  readonly embedded = input(false);
  /** Standalone viewer: shows a "Designer" link to this URL. */
  readonly designerUrl = input<string | null | undefined>(null);
  /** Standalone viewer: shows the Open button for local .report.json files. */
  readonly allowOpen = input(true);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly closed = output<void>();

  private readonly root = viewChild.required<ElementRef<HTMLElement>>('root');
  private readonly scroll = viewChild.required<ElementRef<HTMLElement>>('scroll');
  private readonly findBox = viewChild<ElementRef<HTMLInputElement>>('findBox');

  protected readonly zoomSteps = ZOOM_STEPS;
  protected readonly mode = signal<ViewMode>('continuous');
  protected readonly zoomMode = signal<ZoomMode>(1);
  protected readonly current = signal(0);
  protected readonly sidebar = signal(false);
  protected readonly sideTab = signal<'bookmarks' | 'pages'>('bookmarks');
  protected readonly findOpen = signal(false);
  protected readonly query = signal('');
  protected readonly matchIndex = signal(0);
  protected readonly paramsOpen = signal(true);
  private readonly viewport = signal({ w: 1000, h: 800 });

  protected readonly settings = computed(() => this.store.report().page);
  protected readonly watermark = computed(() => ({ ...defaultWatermark(), ...this.store.report().watermark }));
  protected readonly background = computed(() => ({ ...defaultBackground(), ...this.store.report().background }));
  protected readonly parameters = computed(() => (this.store.report().parameters ?? []).filter((p) => p.name));

  protected readonly doc = computed(() => buildDocument(this.store.report(), this.store.data().rows, this.store.params(), this.store.data().root));
  protected readonly pageCount = computed(() => this.doc().pages.length);
  protected readonly shownPages = computed(() => {
    const pages = this.doc().pages;
    return this.mode() === 'single' ? pages.slice(this.current(), this.current() + 1) : pages;
  });

  /** Effective zoom factor (fit modes depend on the viewport and the page size). */
  protected readonly zoom = computed(() => {
    const z = this.zoomMode();
    if (typeof z === 'number') return z;
    const { w, h } = this.viewport();
    const s = this.settings();
    const pageW = this.mode() === 'two' ? s.width * 2 + 24 : s.width;
    const fitW = (w - 48) / pageW;
    if (z === 'width') return Math.max(0.1, fitW);
    const pageH = this.doc().pages[this.current()]?.height ?? s.height;
    return Math.max(0.1, Math.min(fitW, (h - 48) / pageH));
  });
  protected readonly zoomKey = computed(() => {
    const z = this.zoomMode();
    return typeof z === 'number' ? (ZOOM_STEPS.includes(z) ? String(z) : 'custom') : z;
  });
  protected readonly thumbScale = computed(() => 150 / this.settings().width);

  // Find: every item whose text contains the query.
  protected readonly matches = computed(() => {
    const q = this.query().trim().toLowerCase();
    if (!q) return [] as { key: string; page: number }[];
    return this.doc().pages.flatMap((p) => p.bands.flatMap((b) => b.items.filter((it) => it.text.toLowerCase().includes(q)).map((it) => ({ key: it.key, page: p.index }))));
  });
  protected readonly highlightSet = computed<ReadonlySet<string>>(() => new Set(this.matches().map((m) => m.key)));
  protected readonly activeKey = computed(() => this.matches()[this.matchIndex()]?.key ?? null);

  // Parameters: edit a draft, apply to re-run the report.
  protected readonly draft = signal<Record<string, string>>(
    Object.fromEntries(Object.entries(this.store.params()).map(([k, v]) => [k, v == null ? '' : String(v)])),
  );

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const el = this.scroll().nativeElement;
      const ro = new ResizeObserver(() => this.viewport.set({ w: el.clientWidth, h: el.clientHeight }));
      ro.observe(el);
      destroyRef.onDestroy(() => ro.disconnect());
    });
  }

  protected choices(p: ReportParameter): string[] {
    return paramChoices(p);
  }

  protected setDraft(name: string, value: unknown): void {
    this.draft.update((d) => ({ ...d, [name]: value == null ? '' : String(value) }));
  }

  protected applyParams(): void {
    this.store.paramInput.set({ ...this.draft() });
    this.current.set(0);
  }

  protected asBookmarks(v: unknown): Bookmark[] {
    return v as Bookmark[];
  }

  // --- Navigation -----------------------------------------------------------------------------

  protected goTo(index: number, top = 0): void {
    const i = Math.max(0, Math.min(this.pageCount() - 1, Math.round(index) || 0));
    this.current.set(i);
    if (this.mode() === 'single') {
      this.scroll().nativeElement.scrollTop = top * this.zoom();
      return;
    }
    const el = this.scroll().nativeElement.querySelector<HTMLElement>(`[data-page="${i}"]`);
    if (!el) return;
    const box = this.scroll().nativeElement;
    box.scrollTop += el.getBoundingClientRect().top - box.getBoundingClientRect().top - 12 + top * this.zoom();
  }

  protected goToBookmark(b: Bookmark): void {
    this.goTo(b.page, b.top);
  }

  /** Continuous modes: the current page is the one at the top third of the viewport. */
  protected onScroll(): void {
    if (this.mode() === 'single') return;
    const box = this.scroll().nativeElement;
    const limit = box.getBoundingClientRect().top + box.clientHeight / 3;
    let cur = 0;
    box.querySelectorAll<HTMLElement>('[data-page]').forEach((el) => {
      if (el.getBoundingClientRect().top <= limit) cur = Number(el.dataset['page']);
    });
    if (cur !== this.current()) this.current.set(cur);
  }

  protected setMode(m: ViewMode): void {
    const page = this.current();
    this.mode.set(m);
    setTimeout(() => this.goTo(page));
  }

  // --- Zoom -----------------------------------------------------------------------------------

  protected setZoom(v: string): void {
    if (v === 'custom') return;
    this.zoomMode.set(v === 'width' || v === 'page' ? v : Number(v));
  }

  protected zoomStep(dir: 1 | -1): void {
    const z = this.zoom();
    const next = dir > 0 ? ZOOM_STEPS.find((s) => s > z + 0.001) : [...ZOOM_STEPS].reverse().find((s) => s < z - 0.001);
    if (next) this.zoomMode.set(next);
  }

  // --- Find -----------------------------------------------------------------------------------

  protected toggleFind(): void {
    this.findOpen.set(!this.findOpen());
    if (this.findOpen()) setTimeout(() => this.findBox()?.nativeElement.select());
    else this.query.set('');
  }

  protected setQuery(q: string): void {
    this.query.set(q);
    this.matchIndex.set(0);
    if (this.matches().length) this.revealMatch();
  }

  protected findStep(dir: 1 | -1): void {
    const n = this.matches().length;
    if (!n) return;
    this.matchIndex.set((this.matchIndex() + dir + n) % n);
    this.revealMatch();
  }

  private revealMatch(): void {
    const m = this.matches()[this.matchIndex()];
    if (!m) return;
    if (this.mode() === 'single') this.current.set(m.page);
    setTimeout(() => {
      const el = this.scroll().nativeElement.querySelector<HTMLElement>(`[data-key="${m.key}"]`);
      el?.scrollIntoView({ block: 'center', inline: 'nearest' });
      this.onScroll();
    });
  }

  // --- Print & export -------------------------------------------------------------------------

  /** Runs `fn` with every page rendered at 100% (single-page mode would otherwise print one page). */
  private withAllPages(fn: () => void): void {
    const mode = this.mode();
    const zoom = this.zoomMode();
    this.mode.set('continuous');
    this.zoomMode.set(1);
    setTimeout(() => {
      try {
        fn();
      } finally {
        this.mode.set(mode);
        this.zoomMode.set(zoom);
      }
    }, 60);
  }

  protected print(): void {
    const s = this.settings();
    const height = s.continuous ? this.doc().pages[0]?.height ?? s.height : s.height;
    this.withAllPages(() => {
      // Print a copy of the pages placed directly under <body>, so the host page's layout
      // (scroll containers, overflow, positioning) can't clip or shift them.
      const root = document.createElement('div');
      root.className = 'myreport myreport-print-root';
      const pages = document.createElement('div');
      pages.className = 'viewer-pages';
      pages.innerHTML = this.scroll().nativeElement.querySelector('.viewer-pages')!.innerHTML;
      root.appendChild(pages);
      document.body.appendChild(root);
      const style = document.createElement('style');
      style.textContent = `@page { size: ${s.width}px ${height}px; margin: 0; }`;
      document.head.appendChild(style);
      document.documentElement.classList.add('myreport-printing');
      const cleanup = () => {
        document.documentElement.classList.remove('myreport-printing');
        style.remove();
        root.remove();
        window.removeEventListener('afterprint', cleanup);
      };
      window.addEventListener('afterprint', cleanup);
      // Cleanup runs on afterprint (print() may return before the dialog closes); leftovers are invisible on screen.
      window.print();
    });
  }

  protected save(kind: string): void {
    const name = this.store.report().name.replace(/[^\w\- ]+/g, '').trim() || 'report';
    if (kind === 'pdf') return this.print();
    if (kind === 'json') return download(`${name}.report.json`, JSON.stringify(this.store.report(), null, 2), 'application/json');
    if (kind === 'csv') return download(`${name}.csv`, '﻿' + this.csv(), 'text/csv;charset=utf-8');
    if (kind === 'html') {
      this.withAllPages(() => {
        const pages = this.scroll().nativeElement.querySelector('.viewer-pages')!.innerHTML;
        const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(
          this.store.report().name,
        )}</title><style>${EXPORT_CSS}</style></head><body><div class="viewer-pages">${pages}</div></body></html>`;
        download(`${name}.html`, html, 'text/html;charset=utf-8');
      });
    }
  }

  /** The report's data rows (after the report filter) as CSV. */
  private csv(): string {
    const rows = filterRows(this.store.report(), this.store.data().rows, this.store.params());
    const fields = this.store.data().fields.map((f) => f.name);
    const cell = (v: unknown) => {
      const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const get = (r: Record<string, unknown>, path: string) => path.split('.').reduce<unknown>((o, k) => (o == null ? o : (o as Record<string, unknown>)[k]), r);
    return [fields.map(cell).join(','), ...rows.map((r) => fields.map((f) => cell(get(r, f))).join(','))].join('\r\n');
  }

  protected fullscreen(): void {
    const el = this.root().nativeElement;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.();
  }

  protected async openFile(e: Event): Promise<void> {
    const inputEl = e.target as HTMLInputElement;
    const f = inputEl.files?.[0];
    inputEl.value = '';
    if (!f) return;
    try {
      const r = JSON.parse(await f.text());
      if (!r || r.version !== 1 || !Array.isArray(r.bands)) throw new Error('Not a report definition file');
      this.store.load(r);
      this.current.set(0);
    } catch (err) {
      alert('Could not open file: ' + (err as Error).message);
    }
  }

  // --- Keyboard -------------------------------------------------------------------------------

  @HostListener('window:keydown', ['$event'])
  protected onKey(e: KeyboardEvent): void {
    // Standalone viewers react only when focus is inside them (or nowhere), so a host page keeps its own shortcuts.
    const t = e.target as HTMLElement | null;
    if (!this.embedded() && t && t !== document.body && t !== document.documentElement && !this.host.nativeElement.contains(t)) return;
    const typing = t?.closest?.('input, textarea, select');
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      if (!this.findOpen()) this.toggleFind();
      else this.findBox()?.nativeElement.select();
    } else if (ctrl && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      this.print();
    } else if (typing) {
      return;
    } else if (e.key === 'PageDown') {
      e.preventDefault();
      this.goTo(this.current() + 1);
    } else if (e.key === 'PageUp') {
      e.preventDefault();
      this.goTo(this.current() - 1);
    } else if (e.key === 'Home' && ctrl) {
      this.goTo(0);
    } else if (e.key === 'End' && ctrl) {
      this.goTo(this.pageCount() - 1);
    } else if ((e.key === '+' || e.key === '=') && ctrl) {
      e.preventDefault();
      this.zoomStep(1);
    } else if (e.key === '-' && ctrl) {
      e.preventDefault();
      this.zoomStep(-1);
    } else if (e.key === 'Escape') {
      if (this.findOpen()) this.toggleFind();
      else if (this.embedded()) this.closed.emit();
    }
  }
}

function download(filename: string, content: string, type: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Styles a saved HTML report needs (elements carry their own inline styles). */
const EXPORT_CSS = `
*{box-sizing:border-box}body{margin:0;background:#e6e8eb;font-family:'Segoe UI',Arial,sans-serif}
.viewer-pages{display:flex;flex-direction:column;align-items:center;gap:20px;padding:24px}
.rpt-page{position:relative;background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.25);overflow:hidden;flex-shrink:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.rpt-bg{position:absolute;inset:0;width:100%;height:100%;object-position:center}
.rpt-watermark{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;overflow:hidden;z-index:5}
.rpt-watermark span{white-space:nowrap;line-height:1}
rpt-page-view{display:block}
@media print{body{background:#fff}.viewer-pages{padding:0;gap:0;display:block}.rpt-page{box-shadow:none;break-after:page}.rpt-page:last-child{break-after:auto}}
`;
