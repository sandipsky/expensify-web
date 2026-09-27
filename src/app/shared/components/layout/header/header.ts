import { ChangeDetectionStrategy, Component, output } from '@angular/core';

@Component({
  selector: 'l-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './header.html',
  styleUrl: './header.scss',
})
export class Header {
  /** Fired by the hamburger button; wire it to the sidebar's `toggle()`. */
  readonly menuToggle = output<void>();
}
