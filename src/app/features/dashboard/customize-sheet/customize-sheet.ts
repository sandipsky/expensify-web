import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Button } from '../../../shared/components/ui/button/button';
import { Icon } from '../../../shared/components/ui/icon/icon';
import { Checkbox } from '../../../shared/components/ui/input/checkbox/checkbox';
import { injectSheet } from '../../../shared/services/sheet.service';
import { CARD_LABELS, DashboardCard } from '../dashboard-labels';
import { DashboardLayout } from '../dashboard-layout';

/**
 * Hide and reorder the dashboard's cards (DSH-16): a checkbox and up/down
 * buttons per card, applied at once and kept on this device. The period
 * switcher isn't a card, so it stays pinned to the top.
 */
@Component({
  selector: 'app-customize-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, Button, Checkbox, Icon],
  templateUrl: './customize-sheet.html',
  styleUrl: './customize-sheet.scss',
})
export class CustomizeSheet {
  protected readonly layout = inject(DashboardLayout);
  protected readonly sheet = injectSheet<void, void>();

  protected label(card: DashboardCard): string {
    return CARD_LABELS[card];
  }
}
