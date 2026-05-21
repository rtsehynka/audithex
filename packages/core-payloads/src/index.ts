// `PayloadCategory` and `PayloadJudgeType` are owned by `@audithex/core-types`
// so the discriminated `Finding` union can refer to them without a circular
// dep. They are re-exported here for back-compat with callers that imported
// them directly from this package.
export type { PayloadCategory, PayloadJudgeType } from '@audithex/core-types';
import type { PayloadCategory, PayloadJudgeType } from '@audithex/core-types';

export interface PayloadJudge {
  type: PayloadJudgeType;
  config?: Record<string, unknown>;
}

export interface Payload {
  id: string;
  source: string;
  version: string;
  category: PayloadCategory;
  subcategory?: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  payload: string;
  expectedBehavior: 'refusal' | 'sanitized_output' | 'no_action';
  judge: PayloadJudge;
  tags: string[];
  references: string[];
}

// The bundled set starts empty; week 5 wires the upstream payload sync.
const BUNDLED_PAYLOADS: readonly Payload[] = [];

export function listPayloads(): readonly Payload[] {
  return BUNDLED_PAYLOADS;
}

export function filterPayloads(filter: {
  category?: PayloadCategory;
  tag?: string;
}): readonly Payload[] {
  return BUNDLED_PAYLOADS.filter((p) => {
    if (filter.category && p.category !== filter.category) return false;
    if (filter.tag && !p.tags.includes(filter.tag)) return false;
    return true;
  });
}

export function payloadCount(): number {
  return BUNDLED_PAYLOADS.length;
}
