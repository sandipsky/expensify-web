import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SpinnerService } from '../../../services/spinner.service';

/**
 * Full-screen loading overlay driven by {@link SpinnerService}. Place one
 * instance near the app root; call `SpinnerService.show()` / `hide()` from
 * anywhere to toggle it.
 *
 * ```html
 * <l-loading-spinner />
 * ```
 */
@Component({
  selector: 'l-loading-spinner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './loading-spinner.html',
  styleUrl: './loading-spinner.scss',
})
export class LoadingSpinner {
  private readonly _spinner = inject(SpinnerService);
  protected readonly _visible = this._spinner.visible;
}
