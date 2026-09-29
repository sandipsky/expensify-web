import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * The centred card the sign-in pages sit in (§13):
 * brand, a heading, an optional line under it, then the page's own content.
 */
@Component({
  selector: 'app-auth-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="auth-page">
      <main class="auth-card">
        <span class="auth-card__brand">Expensify</span>
        <h1 class="auth-card__title">{{ title() }}</h1>
        @if (subtitle()) {
          <p class="auth-card__subtitle">{{ subtitle() }}</p>
        }
        <ng-content />
      </main>
    </div>
  `,
  styleUrl: './auth-card.scss',
})
export class AuthCard {
  readonly title = input.required<string>();
  readonly subtitle = input('');
}
