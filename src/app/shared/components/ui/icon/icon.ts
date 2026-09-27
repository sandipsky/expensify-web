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

/**
 * Material Symbols (Outlined, weight 400) names: the same names the Android app draws from
 * the font and that Firestore stores in category and account `icon` fields. The files in
 * `public/svg/` come from `@material-symbols/svg-400` (Apache 2.0) with `fill="currentColor"`
 * added to the root `<svg>`, and each is named exactly after its symbol. `card_giftcard` is
 * a copy of `redeem`: the package dropped that name, and the font maps both to one glyph (U+E8F6).
 */
const ICON_NAMES = [
  'account_balance',
  'account_balance_wallet',
  'add',
  'add_circle',
  'apartment',
  'archive',
  'arrow_downward',
  'arrow_upward',
  'autorenew',
  'bar_chart',
  'beach_access',
  'bolt',
  'build',
  'calendar_month',
  'card_giftcard',
  'category',
  'celebration',
  'check',
  'check_circle',
  'checklist',
  'checkroom',
  'chevron_left',
  'chevron_right',
  'child_care',
  'compare_arrows',
  'computer',
  'content_copy',
  'content_cut',
  'credit_card',
  'delete',
  'directions_bus',
  'directions_car',
  'donut_large',
  'drive_file_move',
  'edit',
  'error',
  'event_repeat',
  'family_restroom',
  'fastfood',
  'filter_list',
  'fitness_center',
  'flight',
  'help',
  'home',
  'local_bar',
  'local_cafe',
  'local_gas_station',
  'local_taxi',
  'lock',
  'medical_services',
  'medication',
  'more_vert',
  'movie',
  'music_note',
  'north_east',
  'pause',
  'payments',
  'pets',
  'phone_iphone',
  'pie_chart',
  'play_arrow',
  'receipt_long',
  'redeem',
  'request_quote',
  'restaurant',
  'savings',
  'schedule',
  'school',
  'search_off',
  'shield',
  'shopping_bag',
  'shopping_cart',
  'skip_next',
  'south_west',
  'spa',
  'sports_esports',
  'star',
  'storefront',
  'swap_horiz',
  'table_rows',
  'train',
  'trending_down',
  'trending_up',
  'tune',
  'unarchive',
  'undo',
  'visibility_off',
  'volunteer_activism',
  'wallet',
  'warning',
  'water_drop',
  'wifi',
  'work',
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
 * Source files may hardcode colors (`stroke="#646663"`, `fill="#555755"`, …)
 * and a fixed width/height (Material Symbols ship at 48px). Swap the colors for
 * `currentColor` so the `color` input (or the inherited text color) drives
 * them, and drop the fixed dimensions so the host's size wins.
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
