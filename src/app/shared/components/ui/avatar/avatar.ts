import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';

/**
 * Compact user/entity avatar. Shows `imageUrl` when provided, otherwise falls
 * back to initials derived from `name` on a solid color chip.
 *
 * ```html
 * <l-avatar name="Ada Lovelace" size="40px" />
 * ```
 */
@Component({
  selector: 'l-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './avatar.html',
  styleUrl: './avatar.scss',
})
export class Avatar {
  /** Image source; when empty, the initials fallback is shown. */
  readonly imageUrl = model<string | null>('');
  /** Full name used to derive the fallback initials. */
  readonly name = input<string>('');
  /** Any CSS length, applied to both width and height. */
  readonly size = input<string>('32px');
  /** Background color of the initials chip. */
  readonly color = input<string>('var(--accent)');
  /** Text color of the initials chip. */
  readonly textColor = input<string>('var(--text-white)');

  protected readonly _initials = computed(() => {
    const value = this.name()?.trim();
    if (!value) return '';

    const parts = value.split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
      return parts[0].charAt(0).toUpperCase();
    }
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  });
}
