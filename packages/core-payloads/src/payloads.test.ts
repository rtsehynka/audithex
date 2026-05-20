import { describe, expect, it } from 'vitest';
import { filterPayloads, listPayloads, payloadCount } from './index.js';

describe('@audithex/core-payloads', () => {
  it('exposes a stable list of payloads', () => {
    expect(Array.isArray(listPayloads())).toBe(true);
  });

  it('payloadCount matches listPayloads length', () => {
    expect(payloadCount()).toBe(listPayloads().length);
  });

  it('filterPayloads returns an empty list when no payloads loaded yet', () => {
    expect(filterPayloads({ category: 'jailbreak_roleplay' })).toEqual([]);
  });
});
