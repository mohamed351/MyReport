import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { FUNCTIONS, SPECIAL_FIELDS, checkExpression, checkTemplate } from '../../engine/expressions';
import { DesignerStore } from '../designer.store';

interface Suggestion {
  label: string;
  insert: string;
  kind: 'field' | 'param' | 'fn' | 'special';
  detail: string;
}

const KIND_ICON = { field: 'Ab', param: '@', fn: 'ƒ', special: '★' } as const;
const SIMPLE_NAME = /^[A-Za-z_À-￿][\w.À-￿]*$/;

/**
 * Text box for templates ("Total: {sum(Amount)}") or bare expressions ("Amount > 100") with
 * autocomplete of fields, @parameters, functions and special fields, plus live validation.
 * Template mode suggests inside {…}; expression mode suggests anywhere. Ctrl+Space opens the list.
 */
@Component({
  selector: 'rpt-expr-input',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="expr-input">
      @if (rows() > 1) {
        <textarea
          #box
          [rows]="rows()"
          [value]="value()"
          [placeholder]="placeholder()"
          spellcheck="false"
          (input)="onInput()"
          (keydown)="onKey($event)"
          (click)="refresh()"
          (blur)="open.set(false)"
        ></textarea>
      } @else {
        <input
          #box
          [value]="value()"
          [placeholder]="placeholder()"
          spellcheck="false"
          (input)="onInput()"
          (keydown)="onKey($event)"
          (click)="refresh()"
          (blur)="open.set(false)"
        />
      }
      @if (open() && items().length) {
        <ul class="ac-list" role="listbox">
          @for (it of items(); track it.kind + it.label; let i = $index) {
            <li [class.active]="i === active()" role="option" (mousedown)="$event.preventDefault(); accept(it)">
              <span class="ac-kind ac-{{ it.kind }}">{{ icons[it.kind] }}</span>
              <b>{{ it.label }}</b>
              <span class="muted">{{ it.detail }}</span>
            </li>
          }
        </ul>
      }
      @if (error()) {
        <div class="expr-error">⚠ {{ error() }}</div>
      }
    </div>
  `,
})
export class ExprInputComponent {
  private readonly store = inject(DesignerStore);
  readonly value = input('');
  readonly mode = input<'template' | 'expression'>('template');
  readonly rows = input(1);
  readonly placeholder = input('');
  readonly valueChange = output<string>();

  private readonly box = viewChild<ElementRef<HTMLInputElement | HTMLTextAreaElement>>('box');
  protected readonly icons = KIND_ICON;
  protected readonly open = signal(false);
  protected readonly active = signal(0);
  protected readonly items = signal<Suggestion[]>([]);
  /** The partial word being completed: [start, end) in the box. */
  private word = { start: 0, end: 0 };

  protected readonly error = computed(() => (this.mode() === 'template' ? checkTemplate(this.value()) : checkExpression(this.value())));

  private readonly all = computed<Suggestion[]>(() => [
    ...this.store.data().fields.map((f) => ({
      label: f.name,
      insert: SIMPLE_NAME.test(f.name) ? f.name : `[${f.name}]`,
      kind: 'field' as const,
      detail: f.type,
    })),
    ...(this.store.data().docFields ?? []).map((f) => ({ label: f.name, insert: f.name, kind: 'field' as const, detail: `document · ${f.type}` })),
    ...(this.store.report().parameters ?? [])
      .filter((p) => p.name)
      .map((p) => ({ label: '@' + p.name, insert: '@' + p.name, kind: 'param' as const, detail: `parameter · ${p.type}` })),
    ...FUNCTIONS.map((f) => ({ label: f.name + '()', insert: f.name, kind: 'fn' as const, detail: f.signature })),
    ...SPECIAL_FIELDS.map((s) => ({ label: s, insert: s, kind: 'special' as const, detail: 'special field' })),
  ]);

  protected onInput(): void {
    const el = this.box()?.nativeElement;
    if (!el) return;
    this.valueChange.emit(el.value);
    this.refresh();
  }

  /** Works out whether the caret is inside an expression and which word is being typed. */
  protected refresh(force = false): void {
    const el = this.box()?.nativeElement;
    if (!el) return;
    const pos = el.selectionStart ?? el.value.length;
    const before = el.value.slice(0, pos);
    let start = 0;
    if (this.mode() === 'template') {
      const openAt = before.lastIndexOf('{');
      if (openAt < 0 || before.lastIndexOf('}') > openAt) return this.open.set(false);
      start = openAt + 1;
    }
    const seg = before.slice(start);
    if ((seg.match(/"/g) ?? []).length % 2 === 1 || (seg.match(/'/g) ?? []).length % 2 === 1) return this.open.set(false); // inside a string
    const word = /@?\[?[\w.À-￿]*$/.exec(seg)?.[0] ?? '';
    this.word = { start: pos - word.length, end: pos };

    const q = word.replace(/^[@[]/, '').toLowerCase();
    let pool = this.all();
    if (word.startsWith('@')) pool = pool.filter((s) => s.kind === 'param');
    const matches = q
      ? [...pool.filter((s) => s.label.replace(/^@/, '').toLowerCase().startsWith(q)), ...pool.filter((s) => !s.label.replace(/^@/, '').toLowerCase().startsWith(q) && s.label.toLowerCase().includes(q))]
      : pool;
    // Don't pop up for a finished word that exactly matches, unless asked.
    const exact = matches.length === 1 && matches[0].insert.toLowerCase() === word.toLowerCase();
    this.items.set(matches.slice(0, 40));
    this.active.set(0);
    this.open.set((force || word.length > 0 || /[{(,\s+\-*/<>=!?:&|]$/.test(before) || seg === '') && matches.length > 0 && !exact);
  }

  protected onKey(e: KeyboardEvent): void {
    // Typing "}" right before an auto-inserted "}" steps over it instead of doubling it.
    const el = this.box()?.nativeElement;
    if (e.key === '}' && el && el.selectionStart === el.selectionEnd && el.value[el.selectionStart ?? -1] === '}') {
      e.preventDefault();
      const p = (el.selectionStart ?? 0) + 1;
      el.setSelectionRange(p, p);
      this.open.set(false);
      return;
    }
    if (e.key === ' ' && e.ctrlKey) {
      e.preventDefault();
      this.refresh(true);
      return;
    }
    if (!this.open() || !this.items().length) return;
    const n = this.items().length;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.active.set((this.active() + 1) % n);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.active.set((this.active() - 1 + n) % n);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      this.accept(this.items()[this.active()]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.open.set(false);
    }
  }

  /** Inserts the suggestion; functions get "()" with the caret inside, templates get a closing "}". */
  protected accept(s: Suggestion): void {
    const el = this.box()?.nativeElement;
    if (!el) return;
    const v = el.value;
    const after = v.slice(this.word.end);
    let insert = s.kind === 'fn' ? s.insert + '()' : s.insert;
    let caret = this.word.start + (s.kind === 'fn' ? s.insert.length + 1 : insert.length);
    if (this.mode() === 'template' && s.kind !== 'fn') {
      const nextClose = after.indexOf('}');
      const nextOpen = after.indexOf('{');
      // Close the expression, but keep the caret inside so the formula can continue ("{Qty * …").
      if (nextClose < 0 || (nextOpen >= 0 && nextOpen < nextClose)) insert += '}';
    }
    el.value = v.slice(0, this.word.start) + insert + after;
    el.setSelectionRange(caret, caret);
    el.focus();
    this.valueChange.emit(el.value);
    this.open.set(false);
    if (s.kind === 'fn') this.refresh(true); // suggest the argument
  }
}
