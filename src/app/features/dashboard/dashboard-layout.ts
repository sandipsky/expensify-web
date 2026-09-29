import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { readState, writeState } from '../notifications/device-state';
import { DASHBOARD_CARDS, DashboardCard, HIDDEN_BY_DEFAULT } from './dashboard-labels';

/** Where this browser keeps the dashboard's card order, hidden cards and privacy mode. */
export const DASHBOARD_LAYOUT_KEY = 'expensify.dashboard.v1';

interface StoredLayout {
  /** Every card, in the user's order. */
  cards: DashboardCard[];
  hidden: DashboardCard[];
  /** Privacy mode: amounts read as •••• (DSH-09). */
  privacy: boolean;
}

/**
 * How this device shows the dashboard: which cards, in what order (DSH-16),
 * and whether amounts are masked (DSH-09). Kept in this browser, not the
 * profile, as each phone keeps its own home screen; open tabs share it.
 */
@Injectable({ providedIn: 'root' })
export class DashboardLayout {
  private readonly state = signal(load());

  /** Every card in the user's order, hidden ones included. */
  readonly order = computed(() => this.state().cards);
  readonly hidden = computed(() => new Set(this.state().hidden));
  /** The cards the page shows, in order. */
  readonly visible = computed(() => this.order().filter((card) => !this.hidden().has(card)));
  readonly privacy = computed(() => this.state().privacy);
  /** Whether the order or the hidden cards differ from the default. */
  readonly customized = computed(
    () =>
      this.order().join() !== DASHBOARD_CARDS.join() ||
      [...this.hidden()].sort().join() !== [...HIDDEN_BY_DEFAULT].sort().join(),
  );

  constructor() {
    // Another tab changed the layout.
    const sync = (event: StorageEvent) => {
      if (event.key === DASHBOARD_LAYOUT_KEY) this.state.set(load());
    };
    window.addEventListener('storage', sync);
    inject(DestroyRef).onDestroy(() => window.removeEventListener('storage', sync));
  }

  isShown(card: DashboardCard): boolean {
    return !this.hidden().has(card);
  }

  setShown(card: DashboardCard, shown: boolean): void {
    const hidden = this.state().hidden.filter((c) => c !== card);
    this.save({ hidden: shown ? hidden : [...hidden, card] });
  }

  /** Moves the card `by` places: −1 up, +1 down. Stays put at either end. */
  move(card: DashboardCard, by: number): void {
    const cards = [...this.state().cards];
    const from = cards.indexOf(card);
    const to = from + by;
    if (from < 0 || to < 0 || to >= cards.length) return;
    cards.splice(from, 1);
    cards.splice(to, 0, card);
    this.save({ cards });
  }

  reset(): void {
    this.save({ cards: [...DASHBOARD_CARDS], hidden: [...HIDDEN_BY_DEFAULT] });
  }

  setPrivacy(privacy: boolean): void {
    this.save({ privacy });
  }

  togglePrivacy(): void {
    this.setPrivacy(!this.privacy());
  }

  private save(changes: Partial<StoredLayout>): void {
    const next = { ...this.state(), ...changes };
    this.state.set(next);
    writeState(DASHBOARD_LAYOUT_KEY, next);
  }
}

const isCard = (value: unknown): value is DashboardCard =>
  DASHBOARD_CARDS.includes(value as DashboardCard);

/** The stored layout, with unknown cards dropped and cards added since appended in default order. */
function load(): StoredLayout {
  const stored = readState<Partial<StoredLayout> | null>(DASHBOARD_LAYOUT_KEY, null);
  const cards = Array.isArray(stored?.cards) ? stored.cards.filter(isCard) : [];
  const known = new Set(cards);
  return {
    cards: [...cards, ...DASHBOARD_CARDS.filter((card) => !known.has(card))],
    hidden: Array.isArray(stored?.hidden) ? stored.hidden.filter(isCard) : [...HIDDEN_BY_DEFAULT],
    privacy: stored?.privacy === true,
  };
}
