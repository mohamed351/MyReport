import { Directive, ElementRef, EventEmitter, NgZone, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';

/**
 * Shared logic for the wrappers. Each wrapper creates the real <myreport-*> Web Component inside its
 * own host element, copies its inputs onto it as DOM properties, and re-emits its CustomEvents as
 * Angular outputs.
 *
 * The wrappers are compiled with Angular 13, the oldest version they support. The Web Component
 * bundle (elements-my-report) carries its own Angular runtime, so the host app's version doesn't matter.
 */

let elements: Promise<void> | null = null;

/** Loads elements-my-report, which defines the custom elements. Called automatically; exported for preloading. */
export function loadMyReportElements(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  return (elements ??= import('elements-my-report').then(() => window.myreportReady));
}

@Directive()
export abstract class ReportElementBase implements OnInit, OnChanges, OnDestroy {
  /** The custom element's tag. */
  protected abstract readonly tag: string;
  /** Input names that are copied onto the element as DOM properties. */
  protected abstract readonly properties: readonly string[];
  /** Custom event name → output. */
  protected abstract outputs(): Record<string, EventEmitter<any>>;

  /** The <myreport-*> element, once created. */
  element: (HTMLElement & Record<string, unknown>) | null = null;
  private off: (() => void)[] = [];

  constructor(private host: ElementRef<HTMLElement>, private zone: NgZone) {}

  ngOnInit(): void {
    if (typeof document === 'undefined') return; // server-side rendering: render nothing
    this.zone.runOutsideAngular(() => {
      const el = document.createElement(this.tag) as HTMLElement & Record<string, unknown>;
      el.style.display = 'block';
      el.style.width = '100%';
      el.style.height = '100%';
      this.element = el;
      this.applyAll();

      for (const [name, output] of Object.entries(this.outputs())) {
        const fn = (e: Event) => this.zone.run(() => output.emit((e as CustomEvent).detail));
        el.addEventListener(name, fn);
        this.off.push(() => el.removeEventListener(name, fn));
      }

      // Properties set before the element is defined are picked up by Angular Elements when it upgrades.
      this.host.nativeElement.appendChild(el);
      loadMyReportElements().catch((err) => console.error('[angular-my-report-legacy] Could not load elements-my-report', err));
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.element) return;
    this.zone.runOutsideAngular(() => {
      for (const name of Object.keys(changes)) if (this.properties.includes(name)) this.apply(name);
    });
  }

  ngOnDestroy(): void {
    this.off.forEach((f) => f());
    this.off = [];
    this.element?.remove();
    this.element = null;
  }

  private applyAll(): void {
    for (const name of this.properties) this.apply(name);
  }

  private apply(name: string): void {
    const value = (this as unknown as Record<string, unknown>)[name];
    if (value !== undefined && this.element && this.element[name] !== value) this.element[name] = value;
  }
}
