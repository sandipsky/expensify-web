import {
  ChangeDetectionStrategy,
  Component,
  Injectable,
  ViewEncapsulation,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

const ICON_NAMES = [
  'account',
  'accounting',
  'add',
  'auto-code-generator',
  'backup-restore',
  'bde',
  'bulk-order',
  'calculator',
  'calendar',
  'cancel',
  'caret',
  'caret-down',
  'cash-bank-voucher',
  'category',
  'close',
  'closing',
  'configuration',
  'credit-note',
  'cross',
  'customer',
  'dashboard',
  'debit-note',
  'designation',
  'dispatch',
  'document-numbering-scheme',
  'download',
  'edit',
  'eye',
  'eye-login',
  'eye-slash',
  'filter',
  'finish-goods-receipt',
  'hold',
  'inventory',
  'journal-entry',
  'lock',
  'logout',
  'manufacturing',
  'master',
  'material-issue',
  'material-issue-return',
  'more',
  'notification',
  'notify',
  'opening-balance',
  'opening-stock',
  'packing',
  'payment',
  'payment-adjustment',
  'pending',
  'physical-stock-master',
  'print',
  'printer',
  'products',
  'purchase',
  'purchase-action',
  'purchase-entry',
  'purchase-order',
  'purchase-return',
  'reports',
  'roles-permission',
  'sales',
  'sales-entry',
  'sales-order',
  'sales-return',
  'search',
  'settings',
  'sidebar',
  'sms',
  'stock-adjustment',
  'stock-edit',
  'taxtype',
  'trash',
  'unit',
  'user',
  'user-plus',
  'users',
  'vendor',
] as const;

/**
 * Icon names — the file names (minus `.svg`) under `public/svg/`.
 * `(string & {})` keeps the union open so newly dropped-in files work
 * without touching this list, while existing names still autocomplete.
 */
export type IconName = (typeof ICON_NAMES)[number] | (string & {});

/** Every bundled icon name, sorted — handy for galleries and pickers. */
export const L_ICON_NAMES: readonly IconName[] = ICON_NAMES;

/**
 * The source files hardcode their gray (`stroke="#646663"`, `fill="#555755"`,
 * …) and their 20px width/height. Swap the colors for `currentColor` so the
 * `color` input (or the inherited text color) drives them, and drop the fixed
 * dimensions so the host's size wins.
 */
const normalize = (raw: string): string =>
  raw
    .replace(
      /<svg([^>]*)>/,
      (_, attrs: string) => `<svg${attrs.replace(/\s(?:width|height)="[^"]*"/g, '')}>`,
    )
    .replace(/\b(stroke|fill)="(?!none)[^"]*"/g, '$1="currentColor"');

/** Fetches the svg files from `public/svg/`, normalized and cached per name. */
@Injectable({ providedIn: 'root' })
export class IconRegistry {
  private readonly _cache = new Map<string, Promise<string>>();

  /** Resolves to `''` (with a dev warning) when the icon doesn't exist. */
  load(name: string): Promise<string> {
    let svg = this._cache.get(name);
    if (!svg) {
      svg = fetch(`svg/${name}.svg`)
        .then((response) => (response.ok ? response.text() : ''))
        .catch(() => '')
        .then((raw) => {
          // The dev server answers missing paths with index.html, so check the
          // payload rather than just the status.
          if (!raw.includes('<svg')) {
            console.warn(`[l-icon] Unknown icon name "${name}".`);
            return '';
          }
          return normalize(raw);
        });
      this._cache.set(name, svg);
    }
    return svg;
  }
}

/**
 * Inline SVG icon. Renders the named file from `public/svg/` with its colors
 * rebound to `currentColor`, so it tints via the `color` input — defaulting
 * to `var(--text-tertiary)` (#646663), the gray the icons were drawn with.
 *
 * ```html
 * <l-icon name="user" />
 * <l-icon name="trash" [size]="16" color="var(--error)" />
 * ```
 */
@Component({
  selector: 'l-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
  styleUrl: './icon.scss',
  // Unscoped on purpose: the svg arrives via innerHTML, which emulated
  // encapsulation can't style.
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'lui-icon',
    'aria-hidden': 'true',
    '[style.width]': '_dimension()',
    '[style.height]': '_dimension()',
    '[style.color]': 'color() || null',
    '[innerHTML]': '_svg()',
  },
})
export class Icon {
  /** Icon to draw — an svg file name from `public/svg/` without the extension. */
  readonly name = input.required<IconName>();

  /** Width/height. A number is pixels; any CSS size string works too. */
  readonly size = input<number | string>(20);

  /**
   * Icon color — any CSS color, including `var(--…)` tokens. Defaults to
   * `var(--text-tertiary)` (#646663); pass `"inherit"` to follow the
   * surrounding text color instead.
   */
  readonly color = input('');

  private readonly _registry = inject(IconRegistry);
  private readonly _sanitizer = inject(DomSanitizer);

  protected readonly _dimension = computed(() => {
    const size = this.size();
    return typeof size === 'number' ? `${size}px` : size;
  });

  protected readonly _svg = signal<SafeHtml | null>(null);

  constructor() {
    effect(() => {
      const name = this.name();
      this._registry.load(name).then((svg) => {
        // Drop stale responses if the name changed while fetching.
        if (this.name() !== name) return;
        // Trusted: the markup is our own bundled asset, normalized above.
        this._svg.set(svg ? this._sanitizer.bypassSecurityTrustHtml(svg) : null);
      });
    });
  }
}
