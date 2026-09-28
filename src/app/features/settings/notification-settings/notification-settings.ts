import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { isTimeOfDay } from '../../../core/domain/reminders';
import { NotificationPrefs } from '../../../core/models/user';
import { Preferences } from '../../../core/preferences';
import { Button } from '../../../shared/components/ui/button/button';
import { Card } from '../../../shared/components/ui/card/card';
import { Icon } from '../../../shared/components/ui/icon/icon';
import { TimeInput } from '../../../shared/components/ui/input/time-input/time-input';
import { Toggle } from '../../../shared/components/ui/input/toggle/toggle';
import { NotificationService } from '../../../shared/components/ui/notification';
import { BrowserNotifications } from '../../notifications/browser-notifications';

type Flag = 'dailyReminder' | 'budgetAlerts' | 'billReminders';

/**
 * Settings › Notifications (SET-07, NTF-04): each kind on or off, the daily
 * reminder's time, and the browser's permission to show them outside the
 * page. `/settings#notifications` scrolls here, as the alerts panel links.
 */
@Component({
  selector: 'app-notification-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, Button, Card, Icon, TimeInput, Toggle],
  templateUrl: './notification-settings.html',
  styleUrl: './notification-settings.scss',
})
export class NotificationSettings {
  private readonly prefs = inject(Preferences);
  private readonly browser = inject(BrowserNotifications);
  private readonly notify = inject(NotificationService);

  protected readonly current = this.prefs.notifications;
  protected readonly permission = this.browser.permission;
  /** Whether any kind is on, so the browser permission is worth asking for. */
  protected readonly anyOn = computed(() => {
    const prefs = this.current();
    return prefs.dailyReminder || prefs.budgetAlerts || prefs.billReminders;
  });

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const fragment = inject(ActivatedRoute).snapshot.fragment;
    afterNextRender(() => {
      if (fragment === 'notifications') host.scrollIntoView?.({ block: 'start' });
    });
  }

  protected setFlag(flag: Flag, value: unknown): void {
    if (typeof value !== 'boolean' || value === this.current()[flag]) return;
    this.save({ [flag]: value });
  }

  protected setTime(value: unknown): void {
    if (isTimeOfDay(value) && value !== this.current().reminderTime) {
      this.save({ reminderTime: value });
    }
  }

  protected async allow(): Promise<void> {
    const answer = await this.browser.request();
    if (answer === 'granted') {
      this.notify.success(
        'Notifications allowed',
        'Alerts show even while the app is in another tab.',
      );
    } else if (answer === 'denied') {
      this.notify.info('Notifications stay off', 'Alerts still show inside the app.');
    }
  }

  private save(changes: Partial<NotificationPrefs>): void {
    this.prefs.save({ notificationPrefs: changes });
  }
}
