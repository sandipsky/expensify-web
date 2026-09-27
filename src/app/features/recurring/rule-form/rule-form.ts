import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { format, getISODay, parseISO } from 'date-fns';
import {
  MAX_AMOUNT,
  currencySymbol,
  fractionDigits,
  toMajorUnits,
  toMinorUnits,
} from '../../../core/domain/money';
import {
  MAX_INTERVAL,
  MAX_OCCURRENCES,
  dayOfMonthOf,
  firstDueDate,
  pendingDates,
  rescheduledDueDate,
  scheduleAfter,
  weekdaysOf,
} from '../../../core/domain/recurrence';
import {
  MAX_NOTE_LENGTH,
  MAX_PAYEE_LENGTH,
  MAX_TAGS,
  localDate,
  normalizeTags,
  payeeSuggestions,
} from '../../../core/domain/transactions';
import {
  EndType,
  Frequency,
  RecurringRule,
  RecurringRuleInput,
  RuleMode,
  Schedule,
} from '../../../core/models/recurring';
import { TxType } from '../../../core/models/transaction';
import { Preferences } from '../../../core/preferences';
import { Button } from '../../../shared/components/ui/button/button';
import { DateInput } from '../../../shared/components/ui/input/date-input/date-input';
import { NumberInput } from '../../../shared/components/ui/input/number-input/number-input';
import { Radio } from '../../../shared/components/ui/input/radio/radio';
import { Select } from '../../../shared/components/ui/input/select/select';
import { TextInput } from '../../../shared/components/ui/input/text-input/text-input';
import { Textarea } from '../../../shared/components/ui/input/textarea/textarea';
import { NotificationService } from '../../../shared/components/ui/notification';
import { SegmentedControl } from '../../../shared/components/ui/segmented-control';
import { injectSheet } from '../../../shared/services/sheet.service';
import { AccountsStore } from '../../accounts/accounts.store';
import { CategoriesStore } from '../../categories/categories.store';
import { TX_TYPE_OPTIONS } from '../../transactions/transaction-labels';
import { TransactionRows } from '../../transactions/transaction-rows';
import { TransactionsStore } from '../../transactions/transactions.store';
import {
  DAY_OF_MONTH_OPTIONS,
  END_OPTIONS,
  FREQUENCY_OPTIONS,
  MODE_OPTIONS,
  entryCount,
  intervalUnit,
  weekdayOptions,
} from '../recurring-labels';
import { RecurringStore } from '../recurring.store';

export interface RuleFormData {
  /** The rule to edit; omit to add one. */
  rule?: RecurringRule;
  /** Adding: start from these fields, as "Make recurring" does (REC-01). */
  prefill?: Partial<RecurringRuleInput>;
  /**
   * The date of the entry being made recurring. Until the user picks a start
   * date, the schedule starts one period after it for whichever frequency is chosen.
   */
  fromDate?: string;
}

const ymd = (date: Date) => format(date, 'yyyy-MM-dd');

const positive = (control: AbstractControl<number | null>): ValidationErrors | null =>
  control.value !== null && control.value <= 0 ? { positive: 'Enter an amount above zero.' } : null;

/** A transfer's two accounts must differ (TXN-02). */
const differentAccount = (control: AbstractControl<string | null>): ValidationErrors | null =>
  control.value && control.value === control.parent?.get('accountId')?.value
    ? { sameAccount: 'Pick a different account from the one it comes from.' }
    : null;

const someDays = (control: AbstractControl<number[]>): ValidationErrors | null =>
  control.value?.length ? null : { required: true };

const wholeNumber = (control: AbstractControl<number | null>): ValidationErrors | null =>
  control.value === null || Number.isInteger(control.value)
    ? null
    : { whole: 'Enter a whole number.' };

/** An end date can't come before the start. */
const afterStart = (control: AbstractControl<Date | null>): ValidationErrors | null => {
  const start = control.parent?.get('startDate')?.value as Date | null | undefined;
  return control.value && start && ymd(control.value) < ymd(start)
    ? { beforeStart: 'Pick a date on or after the start date.' }
    : null;
};

/**
 * Add or edit a recurring rule (REC-01 to REC-04): the entry it creates (type,
 * amount, category, accounts, payee, tags, note), how often (daily, chosen
 * weekdays, a day of the month or the last day, yearly; every N), when it
 * starts and ends, and whether each entry is added automatically or asks
 * first. The amount becomes integer minor units only on save (BR-01). An edit
 * applies to entries from now on (REC-07).
 */
@Component({
  selector: 'app-rule-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    Button,
    DateInput,
    NumberInput,
    Radio,
    SegmentedControl,
    Select,
    TextInput,
    Textarea,
  ],
  templateUrl: './rule-form.html',
  styleUrl: './rule-form.scss',
})
export class RuleForm {
  protected readonly sheet = injectSheet<RuleFormData, string>();
  private readonly store = inject(RecurringStore);
  private readonly transactions = inject(TransactionsStore);
  private readonly accounts = inject(AccountsStore);
  private readonly categories = inject(CategoriesStore);
  private readonly rows = inject(TransactionRows);
  private readonly notify = inject(NotificationService);
  private readonly prefs = inject(Preferences);

  protected readonly rule = this.sheet.data?.rule;
  private readonly fromDate = this.sheet.data?.fromDate;
  private readonly start = this.startingInput();

  protected readonly typeOptions = TX_TYPE_OPTIONS;
  protected readonly frequencyOptions = FREQUENCY_OPTIONS;
  protected readonly endOptions = END_OPTIONS;
  protected readonly modeOptions = [...MODE_OPTIONS];
  protected readonly dayItems = DAY_OF_MONTH_OPTIONS;
  protected readonly weekdayItems = weekdayOptions(this.prefs.locale(), this.prefs.weekStartDay());
  protected readonly maxTags = MAX_TAGS;
  protected readonly tagFromText = (text: string) => normalizeTags([text])[0] ?? '';

  private readonly currency = this.store.currency();
  protected readonly decimalPlaces = fractionDigits(this.currency);
  protected readonly symbol = currencySymbol(this.currency, this.prefs.locale());
  private readonly max = toMajorUnits(MAX_AMOUNT, this.currency);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    type: [this.start.template.type],
    amount: [
      this.start.template.amount ? toMajorUnits(this.start.template.amount, this.currency) : null,
      [Validators.required, positive, Validators.max(this.max)],
    ],
    accountId: [(this.start.template.accountId || null) as string | null, Validators.required],
    toAccountId: [(this.start.template.toAccountId ?? null) as string | null],
    categoryId: [(this.start.template.categoryId ?? null) as string | null],
    payee: [this.start.template.payee ?? '', Validators.maxLength(MAX_PAYEE_LENGTH)],
    note: [this.start.template.note ?? '', Validators.maxLength(MAX_NOTE_LENGTH)],
    tags: [[...this.start.template.tags]],
    frequency: [this.start.frequency],
    interval: [
      this.start.interval as number | null,
      [Validators.required, Validators.min(1), Validators.max(MAX_INTERVAL), wholeNumber],
    ],
    weekdays: [weekdaysOf(this.start)],
    dayOfMonth: [dayOfMonthOf(this.start)],
    startDate: [parseISO(this.start.startDate) as Date | null, Validators.required],
    endType: [this.start.endType],
    maxCount: [this.start.maxCount],
    endDate: [this.start.endDate ? parseISO(this.start.endDate) : (null as Date | null)],
    mode: [this.start.mode],
  });

  private readonly controls = this.form.controls;
  private readonly value = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });
  protected readonly type = computed(() => this.value().type ?? 'expense');
  protected readonly frequency = computed(() => this.value().frequency ?? 'monthly');
  protected readonly endType = computed(() => this.value().endType ?? 'never');
  protected readonly unit = computed(() =>
    intervalUnit(this.frequency(), this.value().interval ?? null),
  );

  /** Past entries for payee suggestions (TXN-12). */
  private readonly recent = toSignal(this.transactions.watchRecent(), { initialValue: [] });
  protected readonly payees = computed(() => payeeSuggestions(this.recent()).slice(0, 50));

  /** Active accounts, plus an archived one the rule already uses (ACC-04). */
  protected readonly accountItems = computed(() => {
    const { accountId, toAccountId } = this.value();
    const extra = [accountId, toAccountId]
      .map((id) => (id ? this.accounts.byId(id) : undefined))
      .filter((a) => !!a && a.archived);
    return [...this.accounts.active(), ...new Set(extra)].map((a) => ({
      value: a!.id,
      label: a!.archived ? `${a!.name} (archived)` : a!.name,
    }));
  });

  /** The type's categories as pickers list them, plus one the rule already uses that they hide. */
  protected readonly categoryItems = computed(() => {
    const type = this.type();
    if (type === 'transfer') return [];
    const pickable = this.categories.pickable()[type];
    const current = this.categories.byId(this.value().categoryId);
    const all =
      current && current.type === type && !pickable.includes(current)
        ? [...pickable, current]
        : pickable;
    return all.map((c) => ({
      value: c.id,
      label: c.archived ? `${this.categories.path(c)} (archived)` : this.categories.path(c),
    }));
  });

  protected readonly tagItems = computed(() => this.start.template.tags);

  /** The schedule and end as the form stands, or null while a field needed for them is invalid. */
  private readonly state = computed(() => {
    const v = this.value();
    if (!v.startDate || !v.interval || v.interval < 1 || !Number.isInteger(v.interval)) return null;
    const schedule = this.schedule();
    const nextDueDate = this.rule
      ? this.scheduleChanged(schedule)
        ? rescheduledDueDate(schedule, this.rule.nextDueDate, this.store.today())
        : this.rule.nextDueDate
      : firstDueDate(schedule);
    return {
      ...schedule,
      endType: v.endType ?? 'never',
      endDate: v.endType === 'until' && v.endDate ? ymd(v.endDate) : null,
      maxCount: v.endType === 'count' ? (v.maxCount ?? null) : null,
      occurrences: this.rule?.occurrences ?? 0,
      nextDueDate,
    };
  });

  /** "Next: Thu, 1 Oct 2026 · Sun, 1 Nov 2026 · Tue, 1 Dec 2026" (REC-02, REC-03). */
  protected readonly preview = computed(() => {
    const state = this.state();
    if (!state) return '';
    const dates = pendingDates(state, 3);
    if (!dates.length) return 'This rule ends before its next entry.';
    return `Next: ${dates.map((d) => this.rows.dateLabel(d)).join(' · ')}`;
  });

  /** A new rule that starts in the past catches up at once (REC-06); say how many that makes. */
  protected readonly pastHint = computed(() => {
    const state = this.state();
    if (this.rule || !state) return '';
    const count = pendingDates(state, MAX_OCCURRENCES + 1, this.store.today()).length;
    if (!count) return '';
    const entries =
      count > MAX_OCCURRENCES ? `More than ${MAX_OCCURRENCES} entries` : entryCount(count);
    return this.value().mode === 'confirm'
      ? `${entries} dated up to today will wait for you to confirm or skip them.`
      : `${entries} dated up to today will be added when you save.`;
  });

  constructor() {
    const { type, accountId, toAccountId, frequency, startDate, endType } = this.controls;
    this.applyTypeRules(type.value);
    this.applyEndRules(endType.value);
    this.applyFrequencyRules(frequency.value);
    type.valueChanges.pipe(takeUntilDestroyed()).subscribe((next) => this.switchType(next));
    accountId.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => toAccountId.updateValueAndValidity());
    endType.valueChanges.pipe(takeUntilDestroyed()).subscribe((end) => this.applyEndRules(end));
    startDate.valueChanges.pipe(takeUntilDestroyed()).subscribe((date) => this.followStart(date));
    frequency.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((next) => this.followFrequency(next));
  }

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const input = this.toInput();
    if (input.template.amount <= 0) {
      this.controls.amount.setErrors({ positive: 'Enter an amount above zero.' });
      this.controls.amount.markAsTouched();
      return;
    }
    const name = input.template.payee || this.categoryName(input.template.categoryId) || 'Transfer';
    if (this.rule) {
      this.store.update(this.rule, input);
      this.notify.success(
        'Recurring rule updated',
        `${name}. Entries already added stay as they were.`,
      );
      this.sheet.close(this.rule.id);
    } else {
      const id = this.store.create(input);
      this.notify.success('Recurring rule added', name);
      this.sheet.close(id);
    }
  }

  private toInput(): RecurringRuleInput {
    const v = this.form.getRawValue();
    const transfer = v.type === 'transfer';
    return {
      template: {
        type: v.type,
        amount: toMinorUnits(v.amount ?? 0, this.currency),
        accountId: v.accountId!,
        toAccountId: transfer ? v.toAccountId : null,
        categoryId: transfer ? null : v.categoryId,
        payee: v.payee.trim() || null,
        note: v.note.trim() || null,
        tags: normalizeTags(v.tags),
      },
      ...this.schedule(),
      endType: v.endType,
      endDate: v.endType === 'until' && v.endDate ? ymd(v.endDate) : null,
      maxCount: v.endType === 'count' ? v.maxCount : null,
      mode: v.mode,
    };
  }

  private schedule(): Schedule {
    const v = this.form.getRawValue();
    return {
      frequency: v.frequency,
      interval: v.interval ?? 1,
      weekdays: v.frequency === 'weekly' ? [...v.weekdays].sort((a, b) => a - b) : [],
      dayOfMonth: v.frequency === 'monthly' ? v.dayOfMonth : null,
      startDate: v.startDate ? ymd(v.startDate) : localDate(),
    };
  }

  private scheduleChanged(schedule: Schedule): boolean {
    const rule = this.rule!;
    return (
      schedule.frequency !== rule.frequency ||
      schedule.interval !== rule.interval ||
      schedule.weekdays.join() !== (rule.frequency === 'weekly' ? rule.weekdays : []).join() ||
      schedule.dayOfMonth !== (rule.frequency === 'monthly' ? rule.dayOfMonth : null) ||
      schedule.startDate !== rule.startDate
    );
  }

  private categoryName(id: string | null | undefined): string {
    const category = this.categories.byId(id);
    return category ? this.categories.path(category) : '';
  }

  /** Switching type keeps a category only when it's of the new type. */
  private switchType(next: TxType): void {
    const { categoryId } = this.controls;
    const category = this.categories.byId(categoryId.value);
    if (next === 'transfer' || (category && category.type !== next)) categoryId.setValue(null);
    this.applyTypeRules(next);
  }

  /** A category for income and expense; a second, different account for transfers (TXN-02). */
  private applyTypeRules(type: TxType): void {
    const { categoryId, toAccountId } = this.controls;
    const transfer = type === 'transfer';
    categoryId.setValidators(transfer ? null : Validators.required);
    toAccountId.setValidators(transfer ? [Validators.required, differentAccount] : null);
    categoryId.updateValueAndValidity({ emitEvent: false });
    toAccountId.updateValueAndValidity({ emitEvent: false });
  }

  /** A count for "After", a date for "On date" (REC-03). */
  private applyEndRules(end: EndType): void {
    const { maxCount, endDate } = this.controls;
    maxCount.setValidators(
      end === 'count'
        ? [Validators.required, Validators.min(1), Validators.max(MAX_OCCURRENCES), wholeNumber]
        : null,
    );
    endDate.setValidators(end === 'until' ? [Validators.required, afterStart] : null);
    if (end === 'count' && maxCount.value === null) maxCount.setValue(12, { emitEvent: false });
    maxCount.updateValueAndValidity({ emitEvent: false });
    endDate.updateValueAndValidity({ emitEvent: false });
  }

  private applyFrequencyRules(frequency: Frequency): void {
    const { weekdays } = this.controls;
    weekdays.setValidators(frequency === 'weekly' ? someDays : null);
    weekdays.updateValueAndValidity({ emitEvent: false });
  }

  /**
   * A new rule's weekday and day of the month follow its start date until the
   * user picks them, so "start on the 15th" repeats on the 15th.
   */
  private followStart(date: Date | null): void {
    this.controls.endDate.updateValueAndValidity({ emitEvent: false });
    if (this.rule || this.fromDate || !date) return;
    const { weekdays, dayOfMonth } = this.controls;
    if (!weekdays.dirty) weekdays.setValue([getISODay(date)], { emitEvent: false });
    if (!dayOfMonth.dirty) dayOfMonth.setValue(date.getDate(), { emitEvent: false });
  }

  /** "Make recurring": the start date stays one period after the entry for the frequency chosen. */
  private followFrequency(frequency: Frequency): void {
    this.applyFrequencyRules(frequency);
    if (!this.fromDate || this.controls.startDate.dirty) return;
    const next = scheduleAfter(this.fromDate, frequency);
    const { startDate, weekdays, dayOfMonth } = this.controls;
    startDate.setValue(parseISO(next.startDate), { emitEvent: false });
    if (!weekdays.dirty) weekdays.setValue(weekdaysOf(next), { emitEvent: false });
    if (!dayOfMonth.dirty) dayOfMonth.setValue(dayOfMonthOf(next), { emitEvent: false });
  }

  /** The rule being edited, or a new one: the prefill, else an expense each month from today. */
  private startingInput(): RecurringRuleInput {
    if (this.rule) return this.rule;
    const today = localDate();
    const prefill = this.sheet.data?.prefill ?? {};
    const defaults: RecurringRuleInput = {
      template: {
        type: 'expense',
        amount: 0,
        accountId: this.transactions.defaultAccountId() ?? '',
        toAccountId: null,
        categoryId: null,
        payee: null,
        note: null,
        tags: [],
      },
      frequency: 'monthly',
      interval: 1,
      weekdays: [getISODay(parseISO(today))],
      dayOfMonth: parseISO(today).getDate(),
      startDate: today,
      endType: 'never',
      endDate: null,
      maxCount: null,
      mode: 'auto' as RuleMode,
    };
    return { ...defaults, ...prefill, template: { ...defaults.template, ...prefill.template } };
  }
}
