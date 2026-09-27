import { Component, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Layout } from './shared/components/layout';
import { Icon } from './shared/components/ui/icon/icon';

@Component({
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Layout, Icon],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  /** Desktop sidebar state: collapsed to a rail shows icons only. */
  protected readonly navCollapsed = signal(false);
}
