import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { addDays, format, isSameDay, parseISO } from 'date-fns';
import {
  MAX_AMOUNT,
  currencySymbol,
  fractionDigits,
  formatMoney,
  toMajorUnits,
  toMinorUnits,
} from '../../../core/domain/money';
import {
  MAX_NOTE_LENGTH,
  MAX_PAYEE_LENGTH,
  MAX_TAGS,
  localDate,
  localTime,
  normalizeTags,
  payeeSuggestions,
  recentCategoryIds,
  suggestCategory,
  tagSuggestions,
} from '../../../core/domain/transactions';
import { ADJUSTMENT_CATEGORY_IDS, CategoryType } from '../../../core/models/category';
import { NewTransaction, Transaction, TxType } from '../../../core/models/transaction';
import { Preferences } from '../../../core/preferences';
import { BreakpointService } from '../../../layout/breakpoint.service';
import { Button } from '../../../shared/components/ui/button/button';
import { Icon } from '../../../shared/components/ui/icon/icon';
import { DateInput } from '../../../shared/components/ui/input/date-input/date-input';
import {
  IconOption,
  IconPicker,
} from '../../../shared/components/ui/input/icon-picker/icon-picker';
import { NumberInput } from '../../../shared/components/ui/input/number-input/number-input';
import { Select } from '../../../shared/components/ui/input/select/select';
import { TextInput } from '../../../shared/components/ui/input/text-input/text-input';
import { Textarea } from '../../../shared/components/ui/input/textarea/textarea';
import { TimeInput } from '../../../shared/components/ui/input/time-input/time-input';
import { Menu } from '../../../shared/components/ui/menu';
import { NotificationService } from '../../../shared/components/ui/notification';
import { SegmentedControl } from '../../../shared/components/ui/segmented-control';
import { injectSheet } from '../../../shared/services/sheet.service';
import { AccountsStore } from '../../accounts/accounts.store';
import { CategoriesStore } from '../../categories/categories.store';
import { TX_TYPE_LABELS, TX_TYPE_OPTIONS } from '../transaction-labels';
import { TransactionsStore } from '../transactions.store';

export interface TransactionFormData {
  /** The transaction to edit; omit to add one. */
  transaction?: Transaction;
  /** Adding: start from these fields, as a duplicate does (TXN-11). */
  prefill?: Partial<NewTransaction>;
  /**
   * Hand the entry back instead of saving it, as confirming an edited
   * recurring entry does (REC-04). Sets the title and the Save button text.
   */
  draft?: { title: string; saveLabel: string };
}

/** How the form closed, beyond a plain Cancel. The opener carries out duplicate and delete. */
export type TransactionFormResult =
  | { action: 'saved'; id: string }
  | { action: 'duplicate'; transaction: Transaction }
  | { action: 'delete'; transaction: Transaction }
  | { action: 'recurring'; transaction: Transaction }
  | { action: 'draft'; transaction: NewTransaction };

/** The form's size: a dialog wide enough for six category tiles a row, a tall sheet on phones. */
export const TRANSACTION_FORM_OPTIONS = {
  width: '560px',
  maxHeight: '760px',
  phoneHeight: '94dvh',
};

/** Category tiles shown before "Show all": two rows on a phone (§13 "recent first"). */
const COLLAPSED_CATEGORIES = 8;

const positive = (control: AbstractControl<number | null>): ValidationErrors | null =>
  control.value !== null && control.value <= 0 ? { positive: 'Enter an amount above zero.' } : null;

/** A transfer's two accounts must differ (TXN-02). */
const differentAccount = (control: AbstractControl<string | null>): ValidationErrors | null =>
  control.value && control.value === control.parent?.get('accountId')?.value
    ? { sameAccount: 'Pick a different account from the one it comes from.' }
    : null;

/**
 * Add or edit a transaction (TXN-01 to TXN-04, TXN-06): type, amount, category
 * grid with recent categories first, account, date with Today and Yesterday,
 * and optional payee, time, tags and note under "More" (§13). New entries start
 * as an expense, today, on the last-used account. The amount accepts sums like
 * 120+45 (TXN-16) and becomes integer minor units only on save (BR-01). Payees
 * and tags are suggested from past entries (TXN-12), and a known payee picks
 * its last category until the user picks one (TXN-15).
 */
@Component({
  selector: 'app-transaction-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    Button,
    DateInput,
    Icon,
    IconPicker,
    Menu,
    NumberInput,
    SegmentedControl,
    Select,
    TextInput,
    Textarea,
    TimeInput,
  ],
  templateUrl: './transaction-form.html',
  styleUrl: './transaction-form.scss',
  host: { '(keydown)': 'onKeydown($event)' },
})
export class TransactionForm {
  protected readonly sheet = injectSheet<TransactionFormData, TransactionFormResult>();
  private readonly store = inject(TransactionsStore);
  private readonly accounts = inject(AccountsStore);
  private readonly categories = inject(CategoriesStore);
  private readonly notify = inject(NotificationService);
  private readonly locale = inject(Preferences).locale;
  protected readonly breakpoints = inject(BreakpointService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly router = inject(Router);

  /** The entry being edited, as opened. */
  protected readonly original = this.sheet.data?.transaction;
  private readonly prefill = this.sheet.data?.prefill ?? {};
  protected readonly draft = this.sheet.data?.draft;
  protected readonly title =
    this.draft?.title ?? (this.original ? 'Edit transaction' : 'Add transaction');

  protected readonly typeOptions = TX_TYPE_OPTIONS;
  protected readonly maxTags = MAX_TAGS;
  protected readonly tagFromText = (text: string) => normalizeTags([text])[0] ?? '';

  /** Fixed for an edit, so its amount keeps its places; otherwise the base currency. */
  private readonly currency = this.original?.currency ?? this.store.currency();
  protected readonly decimalPlaces = fractionDigits(this.currency);
  protected readonly symbol = currencySymbol(this.currency, this.locale());
  /** BR-03's cap, in the major units the field holds. */
  private readonly max = toMajorUnits(MAX_AMOUNT, this.currency);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    type: [this.original?.type ?? this.prefill.type ?? ('expense' as TxType)],
    amount: [this.startAmount(), [Validators.required, positive, Validators.max(this.max)]],
    accountId: [
      this.original?.accountId ?? this.prefill.accountId ?? this.store.defaultAccountId(),
      Validators.required,
    ],
    toAccountId: [
      (this.original?.toAccountId ?? this.prefill.toAccountId ?? null) as string | null,
    ],
    categoryId: [(this.original?.categoryId ?? this.prefill.categoryId ?? null) as string | null],
    date: [this.startDate() as Date | null, Validators.required],
    time: [this.startTime()],
    payee: [
      this.original?.payee ?? this.prefill.payee ?? '',
      Validators.maxLength(MAX_PAYEE_LENGTH),
    ],
    note: [this.original?.note ?? this.prefill.note ?? '', Validators.maxLength(MAX_NOTE_LENGTH)],
    tags: [[...(this.original?.tags ?? this.prefill.tags ?? [])]],
  });

  private readonly controls = this.form.controls;
  protected readonly type = toSignal(this.controls.type.valueChanges, {
    initialValue: this.controls.type.value,
  });
  private readonly categoryId = toSignal(this.controls.categoryId.valueChanges, {
    initialValue: this.controls.categoryId.value,
  });
  private readonly accountIds = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });
  private readonly date = toSignal(this.controls.date.valueChanges, {
    initialValue: this.controls.date.value,
  });

  /** The latest stored version while editing; an edit reverses what's stored now (§4). */
  private readonly live = this.original
    ? toSignal(this.store.watch(this.original.id))
    : signal<Transaction | null | undefined>(undefined);
  /** Past entries for suggestions (TXN-12, TXN-15) and the recent-first grid (§13). */
  private readonly recent = toSignal(this.store.watchRecent(), { initialValue: [] });

  protected readonly payees = computed(() => payeeSuggestions(this.recent()).slice(0, 50));
  protected readonly tagItems = computed(() => tagSuggestions(this.recent()).slice(0, 50));

  /**
   * Payee, time, tags and note start hidden unless they hold something (§13
   * "More"); the time a new entry takes from the clock doesn't count.
   */
  protected readonly showMore = signal(
    !!(
      this.controls.payee.value ||
      this.controls.note.value ||
      this.controls.tags.value.length ||
      this.original?.time
    ),
  );
  protected readonly showAllCategories = signal(false);
  /** The payee whose last category was just picked (TXN-15). */
  protected readonly suggestedFrom = signal('');

  /**
   * Category tiles for the type: recently used first, then the rest in list
   * order. The current category stays even when it's archived or a Balance
   * adjustment, which pickers otherwise hide.
   */
  protected readonly categoryOptions = computed<IconOption[]>(() => {
    const type = this.type();
    if (type === 'transfer') return [];
    const pickable = this.categories.pickable()[type];
    const byId = new Map(pickable.map((c) => [c.id, c]));
    const recent = recentCategoryIds(this.recent(), type).filter((id) => byId.has(id));
    const ordered = [
      ...recent.map((id) => byId.get(id)!),
      ...pickable.filter((c) => !recent.includes(c.id)),
    ];
    const options: IconOption[] = ordered.map((c) => ({
      value: c.id,
      label: c.name,
      icon: c.icon,
      color: c.color,
    }));
    const current = this.categoryId();
    if (current && !byId.has(current)) options.unshift(this.otherCategory(current));
    return options;
  });

  /** The first tiles, plus the chosen one if it's further down, until "Show all". */
  protected readonly visibleCategories = computed(() => {
    const all = this.categoryOptions();
    if (this.showAllCategories() || all.length <= COLLAPSED_CATEGORIES + 1) return all;
    const shown = all.slice(0, COLLAPSED_CATEGORIES);
    const chosen = all.find((o) => o.value === this.categoryId());
    return chosen && !shown.includes(chosen) ? [...shown.slice(0, -1), chosen] : shown;
  });
  protected readonly hiddenCategories = computed(
    () => this.categoryOptions().length - this.visibleCategories().length,
  );

  /** Active accounts, plus an archived one the entry already uses (ACC-04). */
  protected readonly accountItems = computed(() => {
    const { accountId, toAccountId } = this.accountIds();
    const active = this.accounts.active();
    const extra = [accountId, toAccountId]
      .map((id) => (id ? this.accounts.byId(id) : undefined))
      .filter((a) => !!a && a.archived);
    return [...active, ...new Set(extra)].map((a) => ({
      value: a!.id,
      label: a!.archived ? `${a!.name} (archived)` : a!.name,
    }));
  });
  protected readonly hasAccounts = computed(() => this.accounts.active().length > 0);

  protected readonly isToday = computed(() => this.isDaysAgo(0));
  protected readonly isYesterday = computed(() => this.isDaysAgo(1));
  /** Future dates count at once and show as upcoming (BR-10, TXN-14). */
  protected readonly upcoming = computed(() => {
    const date = this.date();
    return !!date && format(date, 'yyyy-MM-dd') > localDate();
  });

  /** The category of each type the user last had, so switching type and back keeps it. */
  private readonly categoryByType: Partial<Record<CategoryType, string | null>> = {};
  private currentType = this.controls.type.value;

  constructor() {
    const { type, accountId, toAccountId, payee, date } = this.controls;
    this.applyTypeRules(type.value);
    type.valueChanges.pipe(takeUntilDestroyed()).subscribe((next) => this.switchType(next));
    accountId.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => toAccountId.updateValueAndValidity());
    payee.valueChanges.pipe(takeUntilDestroyed()).subscribe((text) => this.suggestFor(text));
    date.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => this.followDate(value));

    // Quick add goes straight to the amount (US-01: a few taps).
    if (!this.original) {
      afterNextRender(() =>
        this.host.nativeElement.querySelector<HTMLInputElement>('.tx-form__amount input')?.focus(),
      );
    }
  }

  protected setDaysAgo(days: number): void {
    this.controls.date.setValue(addDays(new Date(), -days));
    this.controls.date.markAsDirty();
  }

  protected seedCategories(): void {
    this.categories.seedDefaults();
  }

  /** Ctrl/⌘+Enter saves, and with Shift saves and starts another (desktop, §10). */
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || !(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    this.save(event.shiftKey && !this.original && !this.draft);
  }

  /** Saves, then closes; with `another`, keeps type, account and date for the next entry (TXN-10). */
  protected save(another = false): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const tx = this.toTransaction();
    if (tx.amount <= 0) {
      this.controls.amount.setErrors({ positive: 'Enter an amount above zero.' });
      this.controls.amount.markAsTouched();
      return;
    }
    if (this.draft) {
      this.close({ action: 'draft', transaction: tx });
      return;
    }
    const summary = this.summary(tx);

    if (this.original) {
      const before = this.live();
      if (before === null) {
        this.notify.error(
          "Couldn't save",
          'This transaction was deleted, perhaps on another device.',
        );
        this.close();
        return;
      }
      this.store.update(before ?? this.original, tx);
      this.notify.success('Transaction updated', summary);
      this.close({ action: 'saved', id: this.original.id });
      return;
    }

    const id = this.store.add(tx);
    this.notify.success(`${TX_TYPE_LABELS[tx.type]} added`, summary);
    if (another) this.startAnother();
    else this.close({ action: 'saved', id });
  }

  protected duplicate(): void {
    this.close({ action: 'duplicate', transaction: this.live() ?? this.original! });
  }

  /** Opens a recurring rule prefilled from this entry (REC-01). */
  protected makeRecurring(): void {
    this.close({ action: 'recurring', transaction: this.live() ?? this.original! });
  }

  /** The rule a generated entry came from. */
  protected openRule(ruleId: string): void {
    this.close();
    void this.router.navigate(['/recurring', ruleId]);
  }

  protected delete(): void {
    this.close({ action: 'delete', transaction: this.live() ?? this.original! });
  }

  protected close(result?: TransactionFormResult): void {
    this.sheet.close(result);
  }

  private toTransaction(): NewTransaction {
    const value = this.form.getRawValue();
    const transfer = value.type === 'transfer';
    return {
      type: value.type,
      amount: toMinorUnits(value.amount ?? 0, this.currency),
      currency: this.currency,
      accountId: value.accountId!,
      toAccountId: transfer ? value.toAccountId : null,
      categoryId: transfer ? null : value.categoryId,
      date: format(value.date!, 'yyyy-MM-dd'),
      time: value.time || null,
      payee: value.payee.trim() || null,
      note: value.note.trim() || null,
      tags: normalizeTags(value.tags),
    };
  }

  /** "Rs 250.00 · Food and dining" for the toast. */
  private summary(tx: NewTransaction): string {
    const amount = formatMoney(tx.amount, tx.currency, this.locale());
    const category = this.categories.byId(tx.categoryId);
    const what =
      tx.type === 'transfer'
        ? `${this.accounts.byId(tx.accountId)?.name} → ${this.accounts.byId(tx.toAccountId!)?.name}`
        : category
          ? this.categories.path(category)
          : tx.payee;
    return what ? `${amount} · ${what}` : amount;
  }

  /** Clears what differs between entries and goes back to the amount (TXN-10). */
  private startAnother(): void {
    this.form.reset({
      ...this.form.getRawValue(),
      amount: null,
      categoryId: null,
      time: this.nowIfToday(this.controls.date.value),
      payee: '',
      note: '',
      tags: [],
    });
    this.categoryByType.expense = this.categoryByType.income = null;
    this.showAllCategories.set(false);
    this.suggestedFrom.set('');
    this.host.nativeElement.querySelector<HTMLInputElement>('.tx-form__amount input')?.focus();
  }

  private switchType(next: TxType): void {
    const { categoryId } = this.controls;
    if (this.currentType !== 'transfer') this.categoryByType[this.currentType] = categoryId.value;
    this.currentType = next;
    categoryId.setValue(next === 'transfer' ? null : (this.categoryByType[next] ?? null));
    this.suggestedFrom.set('');
    this.showAllCategories.set(false);
    this.applyTypeRules(next);
  }

  /** A category for income and expense; a second, different account for transfers (TXN-02). */
  private applyTypeRules(type: TxType): void {
    const { categoryId, toAccountId } = this.controls;
    const transfer = type === 'transfer';
    categoryId.setValidators(transfer ? null : Validators.required);
    toAccountId.setValidators(transfer ? [Validators.required, differentAccount] : null);
    categoryId.updateValueAndValidity();
    toAccountId.updateValueAndValidity();
  }

  /** Picks the payee's last category while adding, until the user picks one (TXN-15). */
  private suggestFor(payee: string): void {
    const type = this.controls.type.value;
    const { categoryId } = this.controls;
    if (this.original || type === 'transfer' || categoryId.dirty) return;
    const suggested = suggestCategory(this.recent(), payee, type);
    const pickable = this.categories.pickable()[type].some((c) => c.id === suggested);
    if (!suggested || !pickable) return;
    categoryId.setValue(suggested);
    this.suggestedFrom.set(payee.trim());
  }

  /** A tile for a category pickers hide, or that no longer exists. */
  private otherCategory(id: string): IconOption {
    const category = this.categories.byId(id);
    if (category) {
      return { value: id, label: category.name, icon: category.icon, color: category.color };
    }
    const adjustment = ADJUSTMENT_CATEGORY_IDS.includes(id);
    return {
      value: id,
      label: adjustment ? 'Balance adjustment' : 'Deleted category',
      icon: adjustment ? 'tune' : 'help',
    };
  }

  private isDaysAgo(days: number): boolean {
    const date = this.date();
    return !!date && isSameDay(date, addDays(new Date(), -days));
  }

  /**
   * A new entry for today takes the current time, so it tops today's list (US-01)
   * under the §10 order, where entries without a time sort below timed ones.
   */
  private startTime(): string {
    if (this.original) return this.original.time ?? '';
    if (this.prefill.time !== undefined) return this.prefill.time ?? '';
    return this.nowIfToday(this.startDate());
  }

  /** Keeps a time the user hasn't touched in step with the date: now for today, none otherwise. */
  private followDate(date: Date | null): void {
    const { time } = this.controls;
    if (!this.original && !time.dirty) time.setValue(this.nowIfToday(date));
  }

  private nowIfToday(date: Date | null): string {
    return date && isSameDay(date, new Date()) ? localTime() : '';
  }

  private startAmount(): number | null {
    const amount = this.original?.amount ?? this.prefill.amount;
    return amount ? toMajorUnits(amount, this.currency) : null;
  }

  private startDate(): Date {
    const date = this.original?.date ?? this.prefill.date;
    return date ? parseISO(date) : new Date();
  }
}
