import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';

export type StepperOrientation = 'horizontal' | 'vertical';
export type StepStatus = 'completed' | 'active' | 'error' | 'upcoming';

/** A single step in an {@link Stepper}. */
export interface Step {
  /** Primary label for the step. */
  title: string;
  /** Optional supporting line under the title. */
  description?: string;
  /**
   * Custom glyph/emoji shown in the indicator instead of the step number.
   * Ignored once the step is completed (checkmark) or in error (alert mark).
   */
  icon?: string;
  /** Mark the step invalid — indicator turns the error color with an alert mark. */
  error?: boolean;
  /** Force the step to read as completed regardless of the active index. */
  completed?: boolean;
  /** Disable this step: dimmed and never selectable. */
  disabled?: boolean;
}

/** @internal Resolved per-step view model consumed by the template. */
interface StepView extends Step {
  index: number;
  number: number;
  status: StepStatus;
  selectable: boolean;
}

/**
 * Stepper — a progress indicator for multi-step flows (wizards, checkout, form
 * sequences), styled after Mantine's stepper: the indicator sits inline with a
 * title/description body and connecting rails run between steps.
 *
 * Steps before the active index render a checkmark in the success color; the
 * active step is highlighted; any step flagged `error` (e.g. its form section is
 * invalid) shows an alert mark in the error color. A step's `icon` overrides the
 * number for steps that are neither completed nor in error, otherwise the step
 * number is shown.
 *
 * `active` is a two-way `model`, so drive it from clickable steps (`clickable`)
 * *or* from external Next/Back buttons via `[(active)]`. `allowStepSkip` gates
 * whether the user may click steps that lie ahead of the current one.
 *
 * ```html
 * <l-stepper [steps]="steps" [(active)]="current" [clickable]="true" />
 * <l-stepper [steps]="steps" orientation="vertical" [active]="2" />
 * ```
 */
@Component({
  selector: 'l-stepper',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './stepper.html',
  styleUrl: './stepper.scss',
  host: {
    '[class]': '_hostClasses()',
  },
})
export class Stepper {
  /** The ordered steps to render. */
  readonly steps = input<readonly Step[]>([]);
  /** Index of the current step. Two-way bindable for click- or button-driven control. */
  readonly active = model(0);
  readonly orientation = input<StepperOrientation>('horizontal');
  /** Show the connecting rails between steps. Steps stay spaced either way. */
  readonly showLines = input(true);
  /** Allow the user to click a step to jump to it. */
  readonly clickable = input(false);
  /** When clickable, also allow selecting steps ahead of the active one (skip forward). */
  readonly allowStepSkip = input(false);

  /** Emits the target index when a step is selected (only fires when it is selectable). */
  readonly stepChange = output<number>();

  protected readonly _steps = computed<StepView[]>(() => {
    const active = this.active();
    const clickable = this.clickable();
    const allowSkip = this.allowStepSkip();
    return this.steps().map((step, index) => ({
      ...step,
      index,
      number: index + 1,
      status: this._resolveStatus(step, index, active),
      selectable: clickable && !step.disabled && (allowSkip || index <= active),
    }));
  });

  protected readonly _hostClasses = computed(() => {
    const classes = ['l-stepper', `l-stepper--${this.orientation()}`];
    if (!this.showLines()) classes.push('l-stepper--no-lines');
    return classes.join(' ');
  });

  private _resolveStatus(step: Step, index: number, active: number): StepStatus {
    if (step.error) return 'error';
    if (step.completed || index < active) return 'completed';
    if (index === active) return 'active';
    return 'upcoming';
  }

  protected _select(step: StepView): void {
    if (!step.selectable || step.index === this.active()) return;
    this.active.set(step.index);
    this.stepChange.emit(step.index);
  }
}
