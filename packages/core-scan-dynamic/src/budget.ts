import { BudgetExceededError } from './errors.js';

/**
 * Tracks dollar spend across a dynamic-scan run with a two-phase
 * reserve/commit protocol so the budget can never overshoot by more
 * than one attack's worst-case cost.
 *
 * Flow per attack:
 *   1. Caller estimates the maximum cost the attack could incur
 *      (input tokens × prompt size + max output tokens × provider rate).
 *   2. `reserve(maxUsd)` deducts that pessimistic amount up-front.
 *      Throws BudgetExceededError if it would push `spentUsd` past
 *      `maxUsd`.
 *   3. Caller dispatches the call.
 *   4. Once the response is back and the actual cost is known, the
 *      caller invokes `commit(actualUsd)` on the reservation. Any
 *      slack between the reservation and the real cost is refunded.
 *
 * The pessimistic reservation step is what makes the budget cap a
 * hard guarantee rather than an advisory: even if an attack overshoots
 * its estimate, the worst case is bounded by the original reservation.
 */
export interface BudgetReservation {
  /** Commit the actual cost incurred by the attack and refund the slack. */
  commit(actualUsd: number): void;
  /** Release the entire reservation (call failed before any cost). */
  cancel(): void;
}

export interface BudgetSnapshot {
  maxUsd: number;
  spentUsd: number;
  /** True once the budget has rejected at least one reservation. */
  exhausted: boolean;
}

export class BudgetTracker {
  readonly maxUsd: number;
  private _spentUsd = 0;
  private _exhausted = false;

  constructor(maxUsd: number) {
    if (!Number.isFinite(maxUsd) || maxUsd < 0) {
      throw new RangeError(`BudgetTracker requires a non-negative finite maxUsd; got ${maxUsd}.`);
    }
    this.maxUsd = maxUsd;
  }

  get spentUsd(): number {
    return this._spentUsd;
  }

  get exhausted(): boolean {
    return this._exhausted;
  }

  remaining(): number {
    return Math.max(0, this.maxUsd - this._spentUsd);
  }

  snapshot(): BudgetSnapshot {
    return { maxUsd: this.maxUsd, spentUsd: this._spentUsd, exhausted: this._exhausted };
  }

  /**
   * Reserves `maxUsd` against the remaining budget. Returns a handle
   * the caller must either `commit(actual)` or `cancel()` once the
   * attack outcome is known. Throws BudgetExceededError when the
   * reservation would push spend past the cap — the tracker enters
   * the `exhausted` state and the runner must stop.
   */
  reserve(maxAttackUsd: number): BudgetReservation {
    if (!Number.isFinite(maxAttackUsd) || maxAttackUsd < 0) {
      throw new RangeError(
        `BudgetTracker.reserve requires a non-negative finite cost; got ${maxAttackUsd}.`,
      );
    }
    if (this._spentUsd + maxAttackUsd > this.maxUsd) {
      this._exhausted = true;
      throw new BudgetExceededError(this.maxUsd, this._spentUsd);
    }
    this._spentUsd += maxAttackUsd;
    let settled = false;
    return {
      commit: (actualUsd: number) => {
        if (settled) {
          throw new Error('BudgetReservation already settled.');
        }
        if (!Number.isFinite(actualUsd) || actualUsd < 0) {
          throw new RangeError(
            `BudgetReservation.commit requires a non-negative finite cost; got ${actualUsd}.`,
          );
        }
        settled = true;
        const clamped = Math.min(actualUsd, maxAttackUsd);
        // Refund the slack between the reservation and the actual cost.
        this._spentUsd -= maxAttackUsd - clamped;
      },
      cancel: () => {
        if (settled) {
          throw new Error('BudgetReservation already settled.');
        }
        settled = true;
        this._spentUsd -= maxAttackUsd;
      },
    };
  }
}
