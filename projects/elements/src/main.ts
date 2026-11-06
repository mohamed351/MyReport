/**
 * elements-my-report — registers <myreport-designer> and <myreport-viewer> as standard Web Components,
 * usable from React, Vue, plain HTML or any other framework.
 */
import { provideZoneChangeDetection, type Type } from '@angular/core';
import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { MyReportDesignerComponent, MyReportViewerComponent } from 'angular-my-report';

const ELEMENTS: [string, Type<unknown>][] = [
  ['myreport-designer', MyReportDesignerComponent],
  ['myreport-viewer', MyReportViewerComponent],
];

declare global {
  interface Window {
    /** Resolves once both elements are defined. */
    myreportReady?: Promise<void>;
  }
}

window.myreportReady ??= (async () => {
  const app = await createApplication({ providers: [provideZoneChangeDetection({ eventCoalescing: true })] });
  for (const [tag, component] of ELEMENTS) {
    if (!customElements.get(tag)) customElements.define(tag, createCustomElement(component, { injector: app.injector }));
  }
})();
