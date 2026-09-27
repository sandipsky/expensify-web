import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type ButtonVariant =
  'primary' | 'secondary' | 'outlined' | 'outlined-primary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';
export type ButtonWidth = 'auto' | 'full';

@Component({
  selector: 'l-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './button.html',
  styleUrl: './button.scss',
})
export class Button {
  readonly variant = input<ButtonVariant>('primary');

  /** `sm` 4×8, `md` 6×12, `lg` 8×16 (px). */
  readonly size = input<ButtonSize>('md');

  /** `auto` fits content, `full` fills the parent width. */
  readonly width = input<ButtonWidth>('auto');

  /** Render as a circular icon button. */
  readonly rounded = input(false);

  readonly disabled = input(false);

  protected readonly _classes = computed(() =>
    [
      'btn',
      `btn-${this.variant()}`,
      `btn-${this.size()}`,
      this.width() === 'full' ? 'full' : '',
      this.rounded() ? 'rounded' : '',
    ]
      .filter(Boolean)
      .join(' '),
  );
}
