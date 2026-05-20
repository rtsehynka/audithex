import type { RuleDocument } from '@audithex/core-types';
import { artifactPropertyEngine } from './artifact-property.js';
import { regexInCodeEngine } from './regex-in-code.js';
import { regexInPromptEngine } from './regex-in-prompt.js';
import type { RuleEngine } from './types.js';

export type { EngineContext, RuleEngine } from './types.js';

const REGISTRY: ReadonlyMap<RuleDocument['engine'], RuleEngine> = new Map([
  [regexInCodeEngine.kind, regexInCodeEngine],
  [regexInPromptEngine.kind, regexInPromptEngine],
  [artifactPropertyEngine.kind, artifactPropertyEngine],
]);

export function getEngine(kind: RuleDocument['engine']): RuleEngine | undefined {
  return REGISTRY.get(kind);
}

export function knownEngines(): readonly RuleDocument['engine'][] {
  return [...REGISTRY.keys()];
}
