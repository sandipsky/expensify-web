import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  input,
} from '@angular/core';
import { Tabs } from './tabs';

let _uid = 0;

/**
 * A single tab inside {@link Tabs}. Carries the strip label (`label`/`icon`) and
 * projects its panel content via `<ng-content>`. The parent tab set owns the
 * active state; this component only shows or hides its panel accordingly.
 */
@Component({
  selector: 'l-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tab.html',
  styleUrl: './tab.scss',
})
export class Tab implements OnInit, OnDestroy {
  /** Strip label. */
  readonly label = input<string>('');
  /** Optional leading glyph/emoji. */
  readonly icon = input<string>('');
  /** Explicit value bound to `l-tabs` `value`. Defaults to the tab's index. */
  readonly value = input<unknown>();
  readonly disabled = input(false);

  readonly tabId = `l-tab-${_uid++}`;
  readonly panelId = `${this.tabId}-panel`;

  private readonly _tabs = inject(Tabs);

  protected readonly _active = computed(() => this._tabs.isActive(this));

  ngOnInit(): void {
    this._tabs._register(this);
  }

  ngOnDestroy(): void {
    this._tabs._unregister(this);
  }
}
