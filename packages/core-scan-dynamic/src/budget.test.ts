import { describe, expect, it } from 'vitest';
import { BudgetTracker } from './budget.js';
import { BudgetExceededError } from './errors.js';

describe('BudgetTracker', () => {
  it('rejects construction with a negative or non-finite cap', () => {
    expect(() => new BudgetTracker(-0.01)).toThrow(RangeError);
    expect(() => new BudgetTracker(Number.NaN)).toThrow(RangeError);
    expect(() => new BudgetTracker(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it('starts at zero spend and full remaining', () => {
    const b = new BudgetTracker(0.1);
    expect(b.spentUsd).toBe(0);
    expect(b.remaining()).toBe(0.1);
    expect(b.exhausted).toBe(false);
  });

  it('reserves spend up-front and refunds the slack on commit', () => {
    const b = new BudgetTracker(0.1);
    const r = b.reserve(0.05);
    expect(b.spentUsd).toBe(0.05);
    r.commit(0.02);
    expect(b.spentUsd).toBeCloseTo(0.02, 8);
    expect(b.remaining()).toBeCloseTo(0.08, 8);
  });

  it('clamps actual cost to the reservation (overrun stays inside the reserved envelope)', () => {
    const b = new BudgetTracker(0.1);
    const r = b.reserve(0.05);
    r.commit(0.09); // actual claims to be larger than the reservation
    expect(b.spentUsd).toBe(0.05); // clamped — never spends more than reserved
  });

  it('cancel() returns the entire reservation', () => {
    const b = new BudgetTracker(0.1);
    const r = b.reserve(0.07);
    r.cancel();
    expect(b.spentUsd).toBe(0);
  });

  it('throws BudgetExceededError when reservation would overrun the cap', () => {
    const b = new BudgetTracker(0.1);
    b.reserve(0.08); // active reservation
    expect(() => b.reserve(0.05)).toThrow(BudgetExceededError);
    expect(b.exhausted).toBe(true);
  });

  it('snapshot captures the exhausted flag', () => {
    const b = new BudgetTracker(0.01);
    expect(b.snapshot()).toEqual({ maxUsd: 0.01, spentUsd: 0, exhausted: false });
    try {
      b.reserve(0.02);
    } catch {
      // expected
    }
    expect(b.snapshot()).toEqual({ maxUsd: 0.01, spentUsd: 0, exhausted: true });
  });

  it('refuses double-settle on a reservation', () => {
    const b = new BudgetTracker(0.1);
    const r = b.reserve(0.05);
    r.commit(0.05);
    expect(() => r.commit(0.05)).toThrow(/already settled/);
    expect(() => r.cancel()).toThrow(/already settled/);
  });

  it('rejects negative actual cost on commit', () => {
    const b = new BudgetTracker(0.1);
    const r = b.reserve(0.05);
    expect(() => r.commit(-0.01)).toThrow(RangeError);
  });
});
